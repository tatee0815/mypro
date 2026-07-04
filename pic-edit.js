document.addEventListener('DOMContentLoaded', () => {
  const imageInput = document.getElementById('image-input');
  const btnConvert = document.getElementById('btn-convert');
  const btnSave = document.getElementById('btn-save');
  const modelSelect = document.getElementById('model-select');
  const editorCanvas = document.getElementById('editor-canvas');
  const canvasWrapper = document.getElementById('canvas-wrapper');
  const loadingOverlay = document.getElementById('loading-overlay');
  const aiGallery = document.getElementById('ai-gallery');
  const ctx = editorCanvas.getContext('2d');

  // Modals
  const imgModal = document.getElementById('img-modal');
  const modalClose = document.getElementById('img-modal-close');
  const previewModal = document.getElementById('preview-modal');
  const uploadModal = document.getElementById('upload-modal');
  const previewModalImg = document.getElementById('preview-modal-img');
  const uploadModalPreviewImg = document.getElementById('upload-modal-preview-img');

  let currentImageBlob = null;
  let currentProcessedBlob = null;
  let originalImgElement = new Image();

  // Load gallery initially
  loadAiGallery();

  // --- Modal Logic ---
  function openModal(modalContentElement) {
    imgModal.classList.add('active');
    modalClose.style.display = 'block';
    previewModal.style.display = 'none';
    uploadModal.style.display = 'none';
    modalContentElement.style.display = 'block';
    
    const cursor = document.querySelector('.cursor');
    if (cursor) cursor.classList.add('modal-active');
  }

  function closeModal() {
    imgModal.classList.remove('active');
    modalClose.style.display = 'none';
    previewModal.style.display = 'none';
    uploadModal.style.display = 'none';

    const cursor = document.querySelector('.cursor');
    if (cursor) cursor.classList.remove('modal-active');
  }

  modalClose.addEventListener('click', closeModal);
  imgModal.addEventListener('click', (e) => {
    if (e.target === imgModal) closeModal();
  });

  // --- Image Upload & Preview ---
  imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      previewModalImg.src = url;
      openModal(previewModal);
      currentImageBlob = file;
    }
  });

  document.getElementById('preview-modal-yes').addEventListener('click', () => {
    closeModal();
    originalImgElement.src = previewModalImg.src;
    originalImgElement.onload = () => {
      canvasWrapper.style.display = 'flex';
      editorCanvas.width = originalImgElement.width;
      editorCanvas.height = originalImgElement.height;
      ctx.drawImage(originalImgElement, 0, 0);
      btnConvert.disabled = false;
      btnSave.disabled = true; // reset save
    };
  });

  document.getElementById('preview-modal-no').addEventListener('click', () => {
    closeModal();
    imageInput.value = ''; // reset
  });

  // --- ONNX Runtime Logic ---
  btnConvert.addEventListener('click', async () => {
    if (!originalImgElement.src) return;
    
    const selectedModel = modelSelect.value;
    loadingOverlay.style.display = 'flex';
    btnConvert.disabled = true;

    // Helper for progress UI
    function updateProgress(percent, text) {
      const fill = document.getElementById('progress-bar-fill');
      const textEl = document.getElementById('loading-text');
      if (fill) fill.style.width = percent + '%';
      if (textEl) textEl.innerText = text;
    }

    try {
      updateProgress(10, 'Initializing AI engine...');
      // Determine optimal size for ONNX model (multiple of 32, max dimension ~512 to prevent OOM in WASM)
      let maxDim = 512;
      let scale = Math.min(maxDim / originalImgElement.width, maxDim / originalImgElement.height);
      if (scale > 1) scale = 1;
      
      let newW = Math.floor(originalImgElement.width * scale);
      let newH = Math.floor(originalImgElement.height * scale);
      newW = newW - (newW % 32) || 32;
      newH = newH - (newH % 32) || 32;

      // Prepare offscreen canvas for AI processing
      const offCanvas = document.createElement('canvas');
      offCanvas.width = newW;
      offCanvas.height = newH;
      const offCtx = offCanvas.getContext('2d');
      offCtx.drawImage(originalImgElement, 0, 0, newW, newH);

      try {
        updateProgress(30, 'Loading model weights...');
        ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';
        const session = await ort.InferenceSession.create(`./models/${selectedModel}`, { executionProviders: ['wasm'] });
        console.log(`Model ${selectedModel} loaded successfully. Running inference...`);
        
        updateProgress(50, 'Preparing image tensor...');
        const inputTensor = preprocess(offCanvas, newW, newH);
        const inputName = session.inputNames[0];
        const feeds = {};
        feeds[inputName] = inputTensor;
        
        // Wait briefly for UI to catch up
        await new Promise(resolve => setTimeout(resolve, 50));
        
        updateProgress(75, 'Running AI inference (this may take a moment)...');
        const results = await session.run(feeds);
        const outputName = session.outputNames[0];
        const outputTensor = results[outputName];
        
        updateProgress(90, 'Rendering output image...');
        await new Promise(resolve => setTimeout(resolve, 50));
        postprocess(outputTensor, offCanvas, newW, newH);
        console.log(`Inference completed.`);
        
        updateProgress(100, 'Done!');
      } catch (err) {
        console.warn("ONNX inference failed. Running fallback demo filter to simulate processing.", err);
        updateProgress(60, 'ONNX failed, falling back to demo filter...');
        await new Promise(resolve => setTimeout(resolve, 1500));
        applyDemoFilter(offCtx, offCanvas.width, offCanvas.height, selectedModel);
        updateProgress(100, 'Done!');
      }

      // Stitch original and edited images side by side
      editorCanvas.width = originalImgElement.width * 2;
      editorCanvas.height = originalImgElement.height;
      
      // Draw original on left
      ctx.drawImage(originalImgElement, 0, 0);
      
      // Draw edited on right (scale back from model size to original size)
      ctx.drawImage(offCanvas, 0, 0, newW, newH, originalImgElement.width, 0, originalImgElement.width, originalImgElement.height);

      // Add a dividing line in the middle
      ctx.beginPath();
      ctx.moveTo(originalImgElement.width, 0);
      ctx.lineTo(originalImgElement.width, originalImgElement.height);
      ctx.strokeStyle = "white";
      ctx.lineWidth = Math.max(2, originalImgElement.width * 0.01); // responsive line width
      ctx.stroke();

      // Convert paired canvas to blob for saving
      editorCanvas.toBlob((blob) => {
        currentProcessedBlob = blob;
        btnSave.disabled = false;
      }, 'image/jpeg', 0.9);

      // Wait a tiny bit for the 100% animation to finish
      await new Promise(resolve => setTimeout(resolve, 400));

    } catch (error) {
      console.error('Error during AI processing:', error);
      alert('An error occurred during processing.');
    } finally {
      loadingOverlay.style.display = 'none';
      // reset progress for next time
      const fill = document.getElementById('progress-bar-fill');
      if (fill) fill.style.width = '0%';
      btnConvert.disabled = false;
    }
  });

  // Fallback demo filter if ONNX model is missing/fails
  function applyDemoFilter(context, width, height, modelName) {
    const imgData = context.getImageData(0, 0, width, height);
    const data = imgData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i], g = data[i+1], b = data[i+2];
      const modelLower = modelName.toLowerCase();
      if (modelLower.includes('hayao')) {
        data[i] = Math.min(255, r * 1.3);
        data[i+1] = Math.min(255, g * 1.2);
        data[i+2] = Math.min(255, b * 1.4);
      } else if (modelLower.includes('ghibli')) {
        data[i] = Math.min(255, r * 1.1);
        data[i+1] = Math.min(255, g * 1.3);
        data[i+2] = Math.min(255, b * 1.1);
      } else if (modelLower.includes('sketch')) {
        let avg = (r + g + b) / 3;
        data[i] = avg; data[i+1] = avg; data[i+2] = avg;
      }
    }
    context.putImageData(imgData, 0, 0);
  }

  // --- Tensor Pre-processing & Post-processing ---
  function preprocess(canvas, width, height) {
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    
    const float32Data = new Float32Array(width * height * 3);
    
    // AnimeGANv3 ONNX models usually expect shape [1, H, W, 3]
    // Normalized to [-1, 1] using: (val / 127.5) - 1.0
    for (let i = 0; i < width * height; i++) {
      let r = data[i * 4];
      let g = data[i * 4 + 1];
      let b = data[i * 4 + 2];
      
      float32Data[i * 3 + 0] = (r / 127.5) - 1.0;
      float32Data[i * 3 + 1] = (g / 127.5) - 1.0;
      float32Data[i * 3 + 2] = (b / 127.5) - 1.0;
    }
    
    return new ort.Tensor('float32', float32Data, [1, height, width, 3]);
  }

  function postprocess(tensor, canvas, width, height) {
    const data = tensor.data;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(width, height);
    
    // Output shape is [1, H, W, 3] in [-1, 1]
    // Denormalize: (val + 1.0) * 127.5
    for (let i = 0; i < width * height; i++) {
      let r = (data[i * 3 + 0] + 1.0) * 127.5;
      let g = (data[i * 3 + 1] + 1.0) * 127.5;
      let b = (data[i * 3 + 2] + 1.0) * 127.5;
      
      imgData.data[i * 4] = Math.max(0, Math.min(255, r));
      imgData.data[i * 4 + 1] = Math.max(0, Math.min(255, g));
      imgData.data[i * 4 + 2] = Math.max(0, Math.min(255, b));
      imgData.data[i * 4 + 3] = 255; // Alpha
    }
    ctx.putImageData(imgData, 0, 0);
  }

  // --- Save Logic ---
  btnSave.addEventListener('click', () => {
    if (!currentProcessedBlob) return;
    uploadModalPreviewImg.src = URL.createObjectURL(currentProcessedBlob);
    openModal(uploadModal);
  });

  document.getElementById('upload-modal-yes').addEventListener('click', async () => {
    const btnConfirm = document.getElementById('upload-modal-yes');
    btnConfirm.innerText = "Uploading...";
    btnConfirm.disabled = true;

    try {
      const formData = new FormData();
      formData.append('image', currentProcessedBlob, 'ai-edit.png');
      formData.append('model', modelSelect.value); // Send the selected model name

      const response = await fetch('/api/upload-ai-edit', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (data.url) {
        closeModal();
        loadAiGallery(); // Refresh gallery
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to save to gallery.');
    } finally {
      btnConfirm.innerText = "Confirm";
      btnConfirm.disabled = false;
    }
  });

  document.getElementById('upload-modal-no').addEventListener('click', () => {
    closeModal();
  });

  // --- Gallery Logic ---
  async function loadAiGallery() {
    try {
      const response = await fetch('/api/images-ai-edit');
      const images = await response.json();
      
      aiGallery.innerHTML = ''; // clear
      
      images.forEach(url => {
        const wrapper = document.createElement('div');
        wrapper.className = 'gallery-img-wrapper';
        wrapper.style.margin = '10px';
        wrapper.style.display = 'inline-block';
        wrapper.style.position = 'relative'; // For absolute badge
        
        const img = document.createElement('img');
        img.src = url;
        img.className = 'gallery-img project-main-img'; // reuse existing class
        img.style.width = '100%';
        img.style.maxWidth = '300px';
        img.style.height = 'auto';
        img.style.objectFit = 'contain';
        img.style.borderRadius = '10px';
        img.style.cursor = 'pointer';
        img.loading = 'lazy';
        
        img.onclick = () => window.openModal(url);
        
        // Determine model from url
        let modelBadge = 'AI Edit';
        if (url.toLowerCase().includes('hayao')) modelBadge = 'Hayao';
        else if (url.toLowerCase().includes('ghibli')) modelBadge = 'Ghibli';
        else if (url.toLowerCase().includes('sketch')) modelBadge = 'Sketch';

        const badge = document.createElement('div');
        badge.innerText = modelBadge;
        badge.style.position = 'absolute';
        badge.style.top = '10px';
        badge.style.right = '10px';
        badge.style.background = 'rgba(0,0,0,0.7)';
        badge.style.color = '#fff';
        badge.style.padding = '4px 8px';
        badge.style.borderRadius = '6px';
        badge.style.fontSize = '0.9rem';
        badge.style.fontWeight = 'bold';
        badge.style.border = '1px solid rgba(255,255,255,0.2)';
        
        wrapper.appendChild(img);
        wrapper.appendChild(badge);
        aiGallery.appendChild(wrapper);
      });
    } catch (err) {
      console.error("Failed to load AI gallery", err);
    }
  }

});
