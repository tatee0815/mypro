window.initPicEdit = function () {
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
  let pendingImageBlob = null;
  let currentProcessedBlob = window.aiState?.processedBlob || null;
  let currentCompareBlob = window.aiState?.compareBlob || null;
  let originalImgElement = new Image();

  // Load gallery initially
  loadAiGallery();

  // --- Global State Restoration ---
  if (window.aiState) {
    if (window.aiState.isProcessing) {
      canvasWrapper.style.display = 'flex';
      document.querySelector('.editor-container').classList.add('has-image');
      loadingOverlay.style.display = 'flex';
      btnConvert.disabled = true;
      if (window.aiState.originalImgElement) {
        originalImgElement.src = window.aiState.originalImgElement.src;
        editorCanvas.width = originalImgElement.width;
        editorCanvas.height = originalImgElement.height;
        ctx.drawImage(originalImgElement, 0, 0);
      }

      // Setup progress callback to update local UI while processing
      window.aiState.onMessageCallback = (percent, text, previewCanvas) => {
        const fill = document.getElementById('progress-bar-fill');
        const textEl = document.getElementById('loading-text');
        if (fill) fill.style.width = percent + '%';
        if (textEl) textEl.innerText = text;

        // Live preview of stitched canvas
        if (previewCanvas) {
          editorCanvas.width = previewCanvas.width;
          editorCanvas.height = previewCanvas.height;
          ctx.drawImage(previewCanvas, 0, 0);
        }
      };

      // Fire it once immediately to sync
      window.aiState.onMessageCallback(window.aiState.progress.percent, window.aiState.progress.text, window.aiState.stitchedCanvas);

    } else if (window.aiState.finalCanvasData) {
      // Completed processing while away
      canvasWrapper.style.display = 'flex';
      document.querySelector('.editor-container').classList.add('has-image');
      editorCanvas.width = window.aiState.finalCanvasData.width;
      editorCanvas.height = window.aiState.finalCanvasData.height;
      ctx.drawImage(window.aiState.finalCanvasData, 0, 0);
      btnSave.disabled = false;
      btnConvert.disabled = false; // Nhả khóa nút khi quay lại và process đã xong
      // Note: originalImgElement is needed if they want to re-convert
      if (window.aiState.originalImgElement) {
        originalImgElement.src = window.aiState.originalImgElement.src;
      }
    }
  }

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
  imageInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      previewModalImg.src = url;
      openModal(previewModal);
      pendingImageBlob = file;
    }
  };

  document.getElementById('preview-modal-yes').onclick = () => {
    closeModal();
    currentImageBlob = pendingImageBlob;
    originalImgElement.src = previewModalImg.src;
    originalImgElement.onload = () => {
      canvasWrapper.style.display = 'flex';
      document.querySelector('.editor-container').classList.add('has-image');
      editorCanvas.width = originalImgElement.width;
      editorCanvas.height = originalImgElement.height;
      ctx.drawImage(originalImgElement, 0, 0);
      btnConvert.disabled = false;
      btnSave.disabled = true; // reset save
    };
  };

  document.getElementById('preview-modal-no').onclick = () => {
    closeModal();
    imageInput.value = ''; // reset
    pendingImageBlob = null;
  };

  // --- ONNX Runtime Logic ---
  btnConvert.onclick = async () => {
    if (!originalImgElement.src) return;

    const selectedModel = modelSelect.value;
    loadingOverlay.style.display = 'flex';
    btnConvert.disabled = true;

    // Global State Registration
    if (window.aiState) {
      window.aiState.isProcessing = true;
      window.aiState.originalImgElement = originalImgElement;
      window.aiState.finalCanvasData = null; // reset
    }

    // Helper for progress UI
    function updateProgress(percent, text) {
      if (window.updateGlobalAiProgress) window.updateGlobalAiProgress(percent, text);

      const fill = document.getElementById('progress-bar-fill');
      const textEl = document.getElementById('loading-text');
      if (fill) fill.style.width = percent + '%';
      if (textEl) textEl.innerText = text;

      if (window.aiState && window.aiState.onMessageCallback) {
        // Trigger any external UI hooks if the user navigated back
        window.aiState.onMessageCallback(percent, text, window.aiState.stitchedCanvas);
      }
    }

    try {
      updateProgress(10, 'Initializing AI engine...');

      const isRealESRGAN = selectedModel.includes('real_esrgan');
      const upscaleFactor = isRealESRGAN ? 2 : 1; // Strictly lock to 2x multiplier for stability

      const MAX_DIMENSION = isRealESRGAN ? 1080 : 512; // AnimeGAN requires smaller resolution to avoid WebGL OOM
      let scale = Math.min(MAX_DIMENSION / originalImgElement.width, MAX_DIMENSION / originalImgElement.height);
      if (scale > 1) scale = 1;

      let newW = Math.floor(originalImgElement.width * scale);
      let newH = Math.floor(originalImgElement.height * scale);

      // Ensure dimensions are multiples of 32 for CNN models (like AnimeGAN) to prevent tensor shape mismatch
      newW = newW - (newW % 32);
      newH = newH - (newH % 32);

      // If image is too small after modulo, enforce a minimum 32x32 size
      if (newW < 32) newW = 32;
      if (newH < 32) newH = 32;

      if (scale < 1) {
        console.log(`[AI Filter] Resized image from ${originalImgElement.width}x${originalImgElement.height} to ${newW}x${newH}`);
      }

      const finalW = newW * upscaleFactor;
      const finalH = newH * upscaleFactor;

      // Prepare offscreen canvas for source image
      let offCanvas = document.createElement('canvas');
      offCanvas.width = newW;
      offCanvas.height = newH;
      let offCtx = offCanvas.getContext('2d');
      offCtx.drawImage(originalImgElement, 0, 0, newW, newH);

      // Prepare final stitched canvas
      const stitchedCanvas = document.createElement('canvas');
      stitchedCanvas.width = finalW;
      stitchedCanvas.height = finalH;
      const stitchedCtx = stitchedCanvas.getContext('2d', { willReadFrequently: true });

      if (window.aiState) {
        window.aiState.stitchedCanvas = stitchedCanvas; // Store globally for live preview restoration
      }

      try {
        updateProgress(10, 'Initializing AI Worker...');

        if (!window.globalAiWorker) {
          window.globalAiWorker = new Worker('ai-worker.js');
        }
        const worker = window.globalAiWorker;
        window.aiState.worker = worker; // Sync backward compatibility

        await new Promise((resolve, reject) => {
          worker.onmessage = (e) => {
            if (e.data.type === 'init_done') {
              const hwStatus = document.getElementById('hardware-status');
              if (hwStatus) {
                if (e.data.provider === 'wasm') {
                  hwStatus.innerText = "Running in power-save mode (CPU). Processing might be slower on this device.";
                } else {
                  hwStatus.innerText = "Accelerated by GPU.";
                }
              }
              resolve();
            }
            if (e.data.type === 'error') reject(new Error(e.data.error));
          };
          worker.postMessage({ type: 'init', modelName: selectedModel, isRealESRGAN });
        });

        if (isRealESRGAN) {
          // Tiling Algorithm with Overlap (Seamless Tiling)
          const tileSize = 256;
          const margin = 32;

          const cols = Math.ceil(newW / tileSize);
          const rows = Math.ceil(newH / tileSize);
          const totalTiles = cols * rows;
          let currentTile = 0;

          // Pre-read full source image data for fast edge clamping extraction
          const sourceImgData = offCtx.getImageData(0, 0, newW, newH).data;

          for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
              currentTile++;
              updateProgress(20 + Math.floor((currentTile / totalTiles) * 70), `Processing tile ${currentTile} of ${totalTiles}...`);

              const startX = x * tileSize;
              const startY = y * tileSize;

              const padW = tileSize + margin * 2;
              const padH = tileSize + margin * 2;

              const tileImgData = new ImageData(padW, padH);
              const destData = tileImgData.data;

              // Extract with clamp padding
              for (let ty = 0; ty < padH; ty++) {
                for (let tx = 0; tx < padW; tx++) {
                  let srcY = Math.max(0, Math.min(newH - 1, startY - margin + ty));
                  let srcX = Math.max(0, Math.min(newW - 1, startX - margin + tx));

                  let destIdx = (ty * padW + tx) * 4;
                  let srcIdx = (srcY * newW + srcX) * 4;

                  destData[destIdx] = sourceImgData[srcIdx];
                  destData[destIdx + 1] = sourceImgData[srcIdx + 1];
                  destData[destIdx + 2] = sourceImgData[srcIdx + 2];
                  destData[destIdx + 3] = sourceImgData[srcIdx + 3];
                }
              }

              // Send to worker
              const tileResult = await new Promise((resolve, reject) => {
                worker.onmessage = (e) => {
                  if (e.data.type === 'process_done') resolve(e.data);
                  if (e.data.type === 'error') reject(new Error(e.data.error));
                };
                worker.postMessage({
                  type: 'process',
                  modelName: selectedModel,
                  isRealESRGAN,
                  buffer: tileImgData.data.buffer,
                  width: padW,
                  height: padH,
                  tileId: currentTile
                }, [tileImgData.data.buffer]);
              });

              // Convert returned data to ImageData
              const upscaledTileData = new ImageData(
                new Uint8ClampedArray(tileResult.buffer),
                tileResult.outW,
                tileResult.outH
              );

              const tempResultCanvas = document.createElement('canvas');
              tempResultCanvas.width = tileResult.outW;
              tempResultCanvas.height = tileResult.outH;
              const tempResultCtx = tempResultCanvas.getContext('2d');
              tempResultCtx.putImageData(upscaledTileData, 0, 0);

              // Calculate crop (Discard Edges)
              const scaledMargin = margin * upscaleFactor;
              const scaledTileSize = tileSize * upscaleFactor;

              // Stitch: Draw only the core onto stitchedCanvas
              stitchedCtx.drawImage(
                tempResultCanvas,
                scaledMargin, scaledMargin, scaledTileSize, scaledTileSize, // Source core
                startX * upscaleFactor, startY * upscaleFactor, scaledTileSize, scaledTileSize // Dest coordinates
              );
            }
          }
        } else {
          // Direct processing for non-RealESRGAN models
          updateProgress(50, 'Processing full image...');
          const fullImgData = offCtx.getImageData(0, 0, newW, newH);

          const result = await new Promise((resolve, reject) => {
            worker.onmessage = (e) => {
              if (e.data.type === 'process_done') resolve(e.data);
              if (e.data.type === 'error') reject(new Error(e.data.error));
            };
            worker.postMessage({
              type: 'process',
              modelName: selectedModel,
              isRealESRGAN,
              buffer: fullImgData.data.buffer,
              width: newW,
              height: newH,
              tileId: 1
            }, [fullImgData.data.buffer]);
          });

          const upscaledData = new ImageData(
            new Uint8ClampedArray(result.buffer),
            result.outW,
            result.outH
          );
          stitchedCtx.putImageData(upscaledData, 0, 0);
        }
        // Removed worker.terminate() so it persists in the background for future runs.

        updateProgress(95, 'Rendering final image...');
        await new Promise(resolve => setTimeout(resolve, 50));

        // Override offCanvas with the final stitched result
        offCanvas = stitchedCanvas;
        offCtx = stitchedCtx;

        console.log(`Inference completed.`);
        updateProgress(100, 'Done!');
      } catch (err) {
        console.warn("ONNX Worker inference failed. Running fallback demo filter.", err);
        updateProgress(60, 'AI failed, falling back to demo filter...');
        await new Promise(resolve => setTimeout(resolve, 1500));
        applyDemoFilter(offCtx, offCanvas.width, offCanvas.height, selectedModel);
        updateProgress(100, 'Done!');
      }

      // Tái lấy lại DOM elements vì user có thể đã lướt qua trang khác rồi quay lại
      const currentEditorCanvas = document.getElementById('editor-canvas');
      let currentCtx = null;

      if (currentEditorCanvas) {
        currentEditorCanvas.width = originalImgElement.width * 2;
        currentEditorCanvas.height = originalImgElement.height;
        currentCtx = currentEditorCanvas.getContext('2d');
        currentCtx.drawImage(originalImgElement, 0, 0);
        currentCtx.drawImage(offCanvas, 0, 0, offCanvas.width, offCanvas.height, originalImgElement.width, 0, originalImgElement.width, originalImgElement.height);

        currentCtx.beginPath();
        currentCtx.moveTo(originalImgElement.width, 0);
        currentCtx.lineTo(originalImgElement.width, originalImgElement.height);
        currentCtx.strokeStyle = "white";
        currentCtx.lineWidth = Math.max(2, originalImgElement.width * 0.01);
        currentCtx.stroke();
      }

      // Render ra offscreen canvas để lưu vào State (phòng trường hợp DOM đang ẩn)
      const finalStateCanvas = document.createElement('canvas');
      finalStateCanvas.width = originalImgElement.width * 2;
      finalStateCanvas.height = originalImgElement.height;
      const finalCtx = finalStateCanvas.getContext('2d');
      finalCtx.drawImage(originalImgElement, 0, 0);
      finalCtx.drawImage(offCanvas, 0, 0, offCanvas.width, offCanvas.height, originalImgElement.width, 0, originalImgElement.width, originalImgElement.height);

      finalCtx.beginPath();
      finalCtx.moveTo(originalImgElement.width, 0);
      finalCtx.lineTo(originalImgElement.width, originalImgElement.height);
      finalCtx.strokeStyle = "white";
      finalCtx.lineWidth = Math.max(2, originalImgElement.width * 0.01);
      finalCtx.stroke();

      if (window.aiState) {
        window.aiState.finalCanvasData = finalStateCanvas;
      }

      offCanvas.toBlob((b) => {
        currentProcessedBlob = b;
        if (window.aiState) window.aiState.processedBlob = b;
        const currentBtnSave = document.getElementById('btn-save');
        if (currentBtnSave) currentBtnSave.disabled = false;
      }, 'image/jpeg', 0.9);

      finalStateCanvas.toBlob((b) => {
        currentCompareBlob = b;
        if (window.aiState) window.aiState.compareBlob = b;
      }, 'image/jpeg', 0.9);

      await new Promise(resolve => setTimeout(resolve, 400));

    } catch (error) {
      console.error('Error during AI processing:', error);
      alert('An error occurred during processing.');
    } finally {
      const currentLoadingOverlay = document.getElementById('loading-overlay');
      if (currentLoadingOverlay) currentLoadingOverlay.style.display = 'none';

      const fill = document.getElementById('progress-bar-fill');
      if (fill) fill.style.width = '0%';
      const hwStatus = document.getElementById('hardware-status');
      if (hwStatus) hwStatus.innerText = '';

      const currentBtnConvert = document.getElementById('btn-convert');
      if (currentBtnConvert) currentBtnConvert.disabled = false;

      if (window.aiState) {
        window.aiState.isProcessing = false;
        window.aiState.onMessageCallback = null;
        if (window.updateGlobalAiProgress) window.updateGlobalAiProgress(0, '');
      }
    }
  };

  // Fallback demo filter if ONNX model is missing/fails
  function applyDemoFilter(context, width, height, modelName) {
    const imgData = context.getImageData(0, 0, width, height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i], g = data[i + 1], b = data[i + 2];
      const modelLower = modelName.toLowerCase();
      if (modelLower.includes('hayao')) {
        data[i] = Math.min(255, r * 1.3);
        data[i + 1] = Math.min(255, g * 1.2);
        data[i + 2] = Math.min(255, b * 1.4);
      } else if (modelLower.includes('ghibli')) {
        data[i] = Math.min(255, r * 1.1);
        data[i + 1] = Math.min(255, g * 1.3);
        data[i + 2] = Math.min(255, b * 1.1);
      } else if (modelLower.includes('sketch')) {
        let avg = (r + g + b) / 3;
        data[i] = avg; data[i + 1] = avg; data[i + 2] = avg;
      }
    }
    context.putImageData(imgData, 0, 0);
  }

  // --- Save Logic ---
  btnSave.onclick = () => {
    // Luôn ưu tiên lấy blob mới nhất từ window.aiState nếu có
    const pBlob = window.aiState?.processedBlob || currentProcessedBlob;
    const cBlob = window.aiState?.compareBlob || currentCompareBlob;

    if (!pBlob || !cBlob) return;

    const saveMode = document.querySelector('input[name="save-mode"]:checked')?.value || 'single';
    const blobToUpload = saveMode === 'single' ? pBlob : cBlob;

    uploadModalPreviewImg.src = URL.createObjectURL(blobToUpload);

    openModal(uploadModal);
  };

  // Listen to radio changes to update preview dynamically
  document.querySelectorAll('input[name="save-mode"]').forEach(radio => {
    radio.onchange = (e) => {
      const pBlob = window.aiState?.processedBlob || currentProcessedBlob;
      const cBlob = window.aiState?.compareBlob || currentCompareBlob;
      uploadModalPreviewImg.src = URL.createObjectURL(e.target.value === 'single' ? pBlob : cBlob);
    };
  });

  document.getElementById('upload-modal-yes').onclick = async () => {
    const btnConfirm = document.getElementById('upload-modal-yes');
    btnConfirm.innerText = "Uploading...";
    btnConfirm.disabled = true;

    try {
      const saveMode = document.querySelector('input[name="save-mode"]:checked')?.value || 'single';
      const pBlob = window.aiState?.processedBlob || currentProcessedBlob;
      const cBlob = window.aiState?.compareBlob || currentCompareBlob;
      const blobToUpload = saveMode === 'single' ? pBlob : cBlob;

      // Fetch Cloudinary config
      const configRes = await fetch('/api/cloudinary-config');
      const config = await configRes.json();

      const formData = new FormData();
      formData.append('file', blobToUpload);
      formData.append('upload_preset', config.upload_preset);
      formData.append('folder', `AI_Edits/${modelSelect.value.replace('.onnx', '')}`);

      // Direct Upload to Cloudinary
      const cloudinaryRes = await fetch(`https://api.cloudinary.com/v1_1/${config.cloud_name}/image/upload`, {
        method: 'POST',
        body: formData
      });
      const cloudinaryData = await cloudinaryRes.json();

      if (!cloudinaryData.secure_url) {
        throw new Error(cloudinaryData.error?.message || 'Cloudinary upload failed');
      }

      // Notify Backend
      const response = await fetch('/api/upload-ai-edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          secure_url: cloudinaryData.secure_url,
          model: modelSelect.value
        })
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
  };

  document.getElementById('upload-modal-no').onclick = () => {
    closeModal();
  };

  // --- Gallery Logic ---
  window.deleteAiImage = function (publicId) {
    if (window.openDeleteModal) {
      window.openDeleteModal(async () => {
        try {
          const res = await fetch(`/api/images/${encodeURIComponent(publicId)}`, {
            method: 'DELETE',
          });
          const responseData = await res.json();
          if (!res.ok) {
            throw new Error(`Xóa thất bại: ${responseData.error || res.statusText}`);
          }
          await loadAiGallery(); // Làm mới gallery AI
        } catch (error) {
          console.error('Lỗi khi xóa ảnh AI:', error.message);
          alert('Không thể xóa ảnh. Lỗi: ' + error.message);
        }
      });
    }
  };

  async function loadAiGallery() {
    try {
      const response = await fetch('/api/images-ai-edit');
      const images = await response.json();

      aiGallery.innerHTML = ''; // clear

      images.forEach((url, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'gallery-img-wrapper gallery-item';
        wrapper.style.margin = '10px';
        wrapper.style.display = 'inline-block';
        wrapper.style.position = 'relative'; // For absolute badge

        // Generate WebP thumbnail URL for faster loading
        const thumbUrl = url.replace('/upload/', '/upload/w_400,q_auto,f_auto/');

        const img = document.createElement('img');
        img.src = thumbUrl;
        img.dataset.src = url;
        img.className = 'gallery-img project-main-img preview-img'; // added preview-img for delegation
        img.setAttribute('data-src', url);
        img.style.width = '100%';
        img.style.maxWidth = '300px';
        img.style.height = 'auto';
        img.style.objectFit = 'contain';
        img.style.borderRadius = '10px';
        img.style.cursor = 'pointer';
        img.loading = 'lazy';

        img.onload = () => {
          setTimeout(() => wrapper.classList.add('loaded'), 100 + index * 60);
        };

        // Determine model from url
        let modelBadge = 'AI Edit';
        const urlLower = url.toLowerCase();
        if (urlLower.includes('hayao')) modelBadge = 'Hayao';
        else if (urlLower.includes('ghibli')) modelBadge = 'Ghibli';
        else if (urlLower.includes('sketch')) modelBadge = 'Sketch';
        else if (urlLower.includes('real_esrgan_x2')) modelBadge = 'Real-ESRGAN x2';
        else if (urlLower.includes('real_esrgan_x4')) modelBadge = 'Real-ESRGAN x4';

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

        // Extract publicId (including folder path: AI_Edits/Hayao/xyz)
        const parts = url.split('/');
        const uploadIndex = parts.indexOf('upload');
        const pathAfterUpload = parts.slice(uploadIndex + 1);
        const publicId = (pathAfterUpload[0].startsWith('v') ? pathAfterUpload.slice(1) : pathAfterUpload).join('/').split('.')[0];

        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '×';
        deleteBtn.style.position = 'absolute';
        deleteBtn.style.top = '10px';
        deleteBtn.style.left = '10px';
        deleteBtn.style.background = 'red';
        deleteBtn.style.color = 'white';
        deleteBtn.style.border = 'none';
        deleteBtn.style.borderRadius = '50%';
        deleteBtn.style.width = '24px';
        deleteBtn.style.height = '24px';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.zIndex = '10'; // Ensure it's above the image

        deleteBtn.onclick = (e) => {
          e.stopPropagation(); // Prevent opening the image modal
          if (window.deleteAiImage) window.deleteAiImage(publicId);
        };

        wrapper.appendChild(img);
        wrapper.appendChild(badge);
        wrapper.appendChild(deleteBtn);
        aiGallery.appendChild(wrapper);
      });
    } catch (err) {
      console.error("Failed to load AI gallery", err);
    }
  }
};

// Initialize if we loaded directly on the pic-edit page
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', window.initPicEdit);
} else {
  // If already loaded, run immediately, but check if we are on the right page
  if (window.location.pathname.includes('pic-edit.html')) {
    window.initPicEdit();
  }
}
