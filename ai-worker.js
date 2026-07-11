importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js');

let session = null;
let currentModelName = null;

let activeProvider = null;

async function initSession(modelName) {
    if (modelName.includes('x4')) throw new Error('Real-ESRGAN x4 is not supported for stability reasons. Please use x2.');
    if (session && currentModelName === modelName) return { session, provider: activeProvider };
    
    // Configure WASM paths just in case it falls back to WASM
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';
    
    const providers = ['webgpu', 'webgl', 'wasm'];
    
    for (const provider of providers) {
        try {
            console.log(`[AI Worker] Attempting to initialize with provider: ${provider}`);
            session = await ort.InferenceSession.create(`./models/${modelName}`, { 
                executionProviders: [provider] 
            });
            activeProvider = provider;
            currentModelName = modelName;
            console.log(`[AI Worker] Successfully initialized using: ${provider}`);
            return { session, provider: activeProvider };
        } catch (e) {
            console.warn(`[AI Worker] Failed to initialize provider '${provider}':`, e.message || e);
        }
    }
    
    throw new Error('All execution providers failed to initialize.');
}

function preprocess(rgbaData, width, height, isRealESRGAN) {
    const float32Data = new Float32Array(width * height * 3);

    if (isRealESRGAN) {
      // Real-ESRGAN expects [1, 3, H, W] (CHW) and range [0, 1]
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let i = (y * width + x);
          let r = rgbaData[i * 4];
          let g = rgbaData[i * 4 + 1];
          let b = rgbaData[i * 4 + 2];
          
          float32Data[0 * (width * height) + i] = r / 255.0;
          float32Data[1 * (width * height) + i] = g / 255.0;
          float32Data[2 * (width * height) + i] = b / 255.0;
        }
      }
      return new ort.Tensor('float32', float32Data, [1, 3, height, width]);
    } else {
      // AnimeGANv3 ONNX models usually expect shape [1, H, W, 3] (HWC)
      // Normalized to [-1, 1] using: (val / 127.5) - 1.0
      for (let i = 0; i < width * height; i++) {
        let r = rgbaData[i * 4];
        let g = rgbaData[i * 4 + 1];
        let b = rgbaData[i * 4 + 2];

        float32Data[i * 3 + 0] = (r / 127.5) - 1.0;
        float32Data[i * 3 + 1] = (g / 127.5) - 1.0;
        float32Data[i * 3 + 2] = (b / 127.5) - 1.0;
      }
      return new ort.Tensor('float32', float32Data, [1, height, width, 3]);
    }
}

function postprocess(tensor, isRealESRGAN) {
    const data = tensor.data;
    const dims = tensor.dims;
    
    let outH, outW;
    if (isRealESRGAN) {
      // [1, 3, H, W]
      outH = dims[2];
      outW = dims[3];
    } else {
      // [1, H, W, 3]
      outH = dims[1];
      outW = dims[2];
    }

    const outputRgba = new Uint8ClampedArray(outW * outH * 4);

    if (isRealESRGAN) {
      // Input shape is [1, 3, H, W] in [0, 1]
      for (let y = 0; y < outH; y++) {
        for (let x = 0; x < outW; x++) {
          let i = (y * outW + x);
          let r = data[0 * (outW * outH) + i] * 255.0;
          let g = data[1 * (outW * outH) + i] * 255.0;
          let b = data[2 * (outW * outH) + i] * 255.0;

          outputRgba[i * 4] = Math.max(0, Math.min(255, r));
          outputRgba[i * 4 + 1] = Math.max(0, Math.min(255, g));
          outputRgba[i * 4 + 2] = Math.max(0, Math.min(255, b));
          outputRgba[i * 4 + 3] = 255;
        }
      }
    } else {
      // Output shape is [1, H, W, 3] in [-1, 1]
      // Denormalize: (val + 1.0) * 127.5
      for (let i = 0; i < outW * outH; i++) {
        let r = (data[i * 3 + 0] + 1.0) * 127.5;
        let g = (data[i * 3 + 1] + 1.0) * 127.5;
        let b = (data[i * 3 + 2] + 1.0) * 127.5;

        outputRgba[i * 4] = Math.max(0, Math.min(255, r));
        outputRgba[i * 4 + 1] = Math.max(0, Math.min(255, g));
        outputRgba[i * 4 + 2] = Math.max(0, Math.min(255, b));
        outputRgba[i * 4 + 3] = 255; // Alpha
      }
    }
    
    return { outputRgba, outW, outH };
}

self.onmessage = async (e) => {
    const { type, modelName, isRealESRGAN, buffer, width, height, tileId } = e.data;
    
    if (type === 'init') {
        try {
            const { provider } = await initSession(modelName);
            self.postMessage({ type: 'init_done', provider });
        } catch (error) {
            self.postMessage({ type: 'error', error: error.message || error.toString() });
        }
        return;
    }
    
    if (type === 'process') {
        try {
            const tileData = new Uint8ClampedArray(buffer);
            const { session: sess } = await initSession(modelName);
            const inputTensor = preprocess(tileData, width, height, isRealESRGAN);
            const inputName = sess.inputNames[0];
            const feeds = {};
            feeds[inputName] = inputTensor;
            
            const results = await sess.run(feeds);
            const outputName = sess.outputNames[0];
            const outputTensor = results[outputName];
            
            const { outputRgba, outW, outH } = postprocess(outputTensor, isRealESRGAN);
            
            self.postMessage({
                type: 'process_done',
                tileId,
                buffer: outputRgba.buffer,
                outW,
                outH
            }, [outputRgba.buffer]); // Transfer buffer to avoid heavy copying
            
        } catch (error) {
            self.postMessage({ type: 'error', error: error.message || error.toString(), tileId });
        }
    }
};
