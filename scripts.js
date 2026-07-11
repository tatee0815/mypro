const menuBtn = document.querySelector('.menu-toggle');
const nav = document.querySelector('nav');
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api';

// Global AI Processing State
window.aiState = {
  worker: null, // Will be initialized lazily or explicitly
  isProcessing: false,
  progress: { percent: 0, text: '' },
  originalImage: null,
  finalCanvasData: null,
  onMessageCallback: null // Used by pic-edit.js to hook into live events
};

// Global AI Badge Injection
document.addEventListener('DOMContentLoaded', () => {
  const badgeHtml = `
      <div id="global-ai-badge" style="display: none; position: fixed; bottom: 20px; left: 20px; background: rgba(0,0,0,0.85); color: white; padding: 15px 25px; border-radius: 30px; z-index: 99999; border: 2px solid #24b7ff; cursor: pointer; box-shadow: 0 0 15px rgba(36,183,255,0.7); font-family: 'Poppins', sans-serif; font-size: 1.2rem; font-weight: 500; align-items: center; gap: 15px;">
        <i class="fa-solid fa-microchip fa-spin" style="color: #00ffcc; font-size: 1.5rem;"></i>
        <span id="global-ai-badge-text">AI Processing... 0%</span>
      </div>
    `;
  document.body.insertAdjacentHTML('beforeend', badgeHtml);

  document.getElementById('global-ai-badge').addEventListener('click', () => {
    if (!window.location.href.includes('pic-edit.html')) {
      // Navigate back to pic-edit using the existing SPA router
      const navLinks = document.querySelectorAll('nav a');
      navLinks.forEach(link => {
        if (link.getAttribute('href') === 'pic-edit.html') link.click();
      });
    }
  });
});

window.updateGlobalAiProgress = (percent, text) => {
  window.aiState.progress = { percent, text };

  const badge = document.getElementById('global-ai-badge');
  const badgeText = document.getElementById('global-ai-badge-text');

  if (window.aiState.isProcessing) {
    if (badge) badge.style.display = 'flex';
    if (badgeText) badgeText.innerText = `AI Processing... ${percent}%`;
  } else {
    if (badge) badge.style.display = 'none';
  }
};
// Global Modal getters
function getModalEls() {
  return {
    modal: document.getElementById('img-modal'),
    img: document.getElementById('img-modal-img'),
    deleteModal: document.getElementById('delete-modal'),
    deleteModalPasswordInput: document.getElementById('delete-modal-password-input'),
    deleteModalError: document.getElementById('delete-modal-error'),
    deleteModalYesBtn: document.getElementById('delete-modal-yes'),
    deleteModalNoBtn: document.getElementById('delete-modal-no'),
    uploadModal: document.getElementById('upload-modal'),
    uploadModalPreviewImg: document.getElementById('upload-modal-preview-img'),
    uploadModalPasswordInput: document.getElementById('upload-modal-password-input'),
    uploadModalError: document.getElementById('upload-modal-error'),
    uploadModalYesBtn: document.getElementById('upload-modal-yes'),
    uploadModalNoBtn: document.getElementById('upload-modal-no')
  };
}

// Cursor
const cursor = document.querySelector('.cursor');

window.addEventListener('mousemove', (e) => {
  if (!cursor) return;
  cursor.style.setProperty('--x', `${e.clientX - 15}px`);
  cursor.style.setProperty('--y', `${e.clientY - 15}px`);
});
document.addEventListener('mousedown', () => {
  cursor.classList.add('active');
});
document.addEventListener('mouseup', () => {
  cursor.classList.remove('active');
});


// Menu toggle
if (menuBtn && nav) {
  menuBtn.addEventListener('click', () => {
    nav.classList.toggle('open');
  });
} else {
  console.error('Không tìm thấy .menu-toggle hoặc nav trong DOM');
}

// Modal functions
function openModal(imgSrc) {
  const els = getModalEls();
  if (!els.modal || !els.img) {
    console.error('Không tìm thấy các phần tử modal cốt lõi (#img-modal hoặc #img-modal-img)');
    return;
  }

  els.img.src = imgSrc.src ? imgSrc.src : imgSrc;
  els.img.style.display = 'block';
  if (els.deleteModal) els.deleteModal.style.display = 'none';
  if (els.uploadModal) els.uploadModal.style.display = 'none';
  els.modal.classList.add('active');

  const cursor = document.querySelector('.cursor');
  if (cursor) cursor.classList.add('modal-active');

  const closeBtn = els.modal.querySelector('.img-modal-close');
  if (closeBtn) closeBtn.onclick = closeModal;

  els.modal.onclick = function (e) {
    if (e.target === els.modal) closeModal();
  };
}

function closeModal() {
  const els = getModalEls();
  if (els.modal) {
    els.modal.classList.remove('active');
    const cursor = document.querySelector('.cursor');
    if (cursor) cursor.classList.remove('modal-active');
    if (els.img) els.img.style.display = 'none';
    if (els.deleteModal) els.deleteModal.style.display = 'none';
    if (els.deleteModalPasswordInput) els.deleteModalPasswordInput.value = '';
    if (els.deleteModalError) els.deleteModalError.style.display = 'none';
    if (els.uploadModal) els.uploadModal.style.display = 'none';
    if (els.uploadModalPreviewImg) els.uploadModalPreviewImg.src = '';
    if (els.uploadModalPasswordInput) els.uploadModalPasswordInput.value = '';
    if (els.uploadModalError) els.uploadModalError.style.display = 'none';
  }
}

function openDeleteModal(callback) {
  const els = getModalEls();
  if (!els.modal || !els.deleteModal || !els.deleteModalPasswordInput || !els.deleteModalYesBtn || !els.deleteModalNoBtn) {
    console.error('Không tìm thấy các phần tử modal xóa');
    return;
  }

  els.img.style.display = 'none';
  els.deleteModal.style.display = 'block';
  if (els.uploadModal) els.uploadModal.style.display = 'none';
  els.modal.classList.add('active');
  els.deleteModalPasswordInput.value = '';
  els.deleteModalError.style.display = 'none';
  els.deleteModalPasswordInput.focus();

  els.deleteModalYesBtn.onclick = async () => {
    const pwd = els.deleteModalPasswordInput.value;
    if (!pwd) {
      els.deleteModalError.style.display = 'block';
      els.deleteModalPasswordInput.value = '';
      els.deleteModalPasswordInput.focus();
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
      });
      const data = await res.json();

      if (!data.success) {
        els.deleteModalError.style.display = 'block';
        els.deleteModalPasswordInput.value = '';
        els.deleteModalPasswordInput.focus();
        return;
      }

      els.deleteModalError.style.display = 'none';
      closeModal();
      callback();
    } catch (error) {
      console.error('Lỗi xác thực:', error);
      els.deleteModalError.style.display = 'block';
    }
  };

  els.deleteModalNoBtn.onclick = closeModal;
}

function openUploadModal(imgSrc, callback) {
  const els = getModalEls();
  if (!els.modal || !els.uploadModal || !els.uploadModalPreviewImg || !els.uploadModalPasswordInput || !els.uploadModalYesBtn || !els.uploadModalNoBtn) {
    console.error('Không tìm thấy các phần tử modal upload');
    return;
  }

  els.img.style.display = 'none';
  if (els.deleteModal) els.deleteModal.style.display = 'none';
  els.uploadModal.style.display = 'block';
  els.modal.classList.add('active');
  els.uploadModalPreviewImg.src = imgSrc;
  els.uploadModalPasswordInput.value = '';
  els.uploadModalError.style.display = 'none';
  els.uploadModalPasswordInput.focus();

  els.uploadModalYesBtn.onclick = async () => {
    const pwd = els.uploadModalPasswordInput.value;
    if (!pwd) {
      els.uploadModalError.style.display = 'block';
      els.uploadModalPasswordInput.value = '';
      els.uploadModalPasswordInput.focus();
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
      });
      const data = await res.json();

      if (!data.success) {
        els.uploadModalError.style.display = 'block';
        els.uploadModalPasswordInput.value = '';
        els.uploadModalPasswordInput.focus();
        return;
      }

      els.uploadModalError.style.display = 'none';
      closeModal();
      callback();
    } catch (error) {
      console.error('Lỗi xác thực:', error);
      els.uploadModalError.style.display = 'block';
    }
  };

  els.uploadModalNoBtn.onclick = closeModal;
}

// Lấy và hiển thị ảnh từ Cloudinary
async function fetchImages() {
  try {
    const res = await fetch(`${API_BASE}/images`);
    if (!res.ok) {
      throw new Error(`Lỗi HTTP! status: ${res.status}`);
    }
    const images = await res.json();
    const gallery = document.getElementById('gallery');
    if (!gallery) return;
    gallery.innerHTML = images.map(url => {
      // Trích xuất public_id từ URL Cloudinary
      const parts = url.split('/');
      const uploadIndex = parts.indexOf('upload');
      const pathAfterUpload = parts.slice(uploadIndex + 1);
      const publicId = (pathAfterUpload[0].startsWith('v') ? pathAfterUpload.slice(1) : pathAfterUpload).join('/').split('.')[0];
      // Generate WebP thumbnail URL: /image/upload/w_400,q_auto,f_auto/
      const thumbUrl = url.replace('/upload/', '/upload/w_400,q_auto,f_auto/');
      return `
        <div class="gallery-item" style="display:inline-block; position:relative;">
          <img src="${thumbUrl}" alt="pic" class="preview-img" data-src="${url}" style="cursor:pointer;">
          <button onclick="deleteImage('${publicId}')" style="position:absolute; top:5px; right:5px; background:red; color:white; border:none; border-radius:50%; width:24px; height:24px; cursor:pointer; z-index:10;">×</button>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Lỗi khi lấy ảnh:', error.message);
    const gallery = document.getElementById('gallery');
    if (gallery) {
      gallery.innerHTML = '<p>Không thể tải danh sách ảnh. Lỗi: ' + error.message + '</p>';
    }
  }
}

// Xóa ảnh từ Cloudinary
async function deleteImage(publicId) {
  openDeleteModal(async () => {
    try {
      const res = await fetch(`${API_BASE}/images/${encodeURIComponent(publicId)}`, {
        method: 'DELETE',
      });
      const responseData = await res.json();
      if (!res.ok) {
        throw new Error(`Xóa thất bại: ${responseData.error || res.statusText}`);
      }
      await fetchImages(); // Làm mới gallery
    } catch (error) {
      console.error('Lỗi khi xóa ảnh:', error.message);
      alert('Không thể xóa ảnh. Lỗi: ' + error.message);
    }
  });
}

window.initSomePics = function () {
  const uploadForm = document.getElementById('upload-form');
  const imageInput = document.getElementById('image-input');
  const fileChosen = document.getElementById('file-chosen');
  const imgPreview = document.getElementById('img-preview');
  const modal = document.getElementById('img-modal');

  if (imageInput && fileChosen && imgPreview) {
    let selectedFiles = [];
    let currentPreviewIndex = 0;
    const uploadPreviewImg = document.getElementById('upload-modal-preview-img');
    if (uploadPreviewImg) uploadPreviewImg.style.cursor = 'pointer';

    imageInput.addEventListener('change', function () {
      if (this.files && this.files.length > 0) {
        selectedFiles = Array.from(this.files);
        currentPreviewIndex = 0;

        const loadPreview = (index, callback) => {
          const reader = new FileReader();
          reader.onload = (e) => callback(e.target.result);
          reader.readAsDataURL(selectedFiles[index]);
        };

        loadPreview(0, (firstImgData) => {
          imgPreview.src = firstImgData;
          imgPreview.style.display = 'none';

          const modalText = document.getElementById('upload-modal-text');
          if (modalText) {
            modalText.innerText = selectedFiles.length > 1
              ? `Upload these ${selectedFiles.length} photos? (Click image to view next)`
              : `Upload this photo?`;
          }

          if (uploadPreviewImg) {
            uploadPreviewImg.onclick = () => {
              if (selectedFiles.length > 1) {
                currentPreviewIndex = (currentPreviewIndex + 1) % selectedFiles.length;
                loadPreview(currentPreviewIndex, (data) => {
                  uploadPreviewImg.src = data;
                });
              }
            };
          }

          openUploadModal(firstImgData, async () => {
            try {
              // Fetch config
              const configRes = await fetch(`${API_BASE}/cloudinary-config`);
              const config = await configRes.json();

              // Upload all files concurrently
              const uploadPromises = selectedFiles.map(async (file) => {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', config.upload_preset);
                formData.append('folder', 'somepics');

                const cloudRes = await fetch(`https://api.cloudinary.com/v1_1/${config.cloud_name}/image/upload`, {
                  method: 'POST',
                  body: formData,
                });
                const cloudData = await cloudRes.json();

                if (!cloudData.secure_url) throw new Error(cloudData.error?.message || 'Upload thất bại cho 1 file');

                return fetch(`${API_BASE}/upload`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ secure_url: cloudData.secure_url })
                }).then(res => res.json());
              });

              await Promise.all(uploadPromises);

              await fetchImages();
              imageInput.value = '';
              imgPreview.style.display = 'none';
              selectedFiles = [];
            } catch (error) {
              console.error('Lỗi khi upload ảnh:', error.message);
              alert('Có lỗi trong quá trình tải ảnh lên. Lỗi: ' + error.message);
            }
          });
        });
      } else {
        imgPreview.style.display = 'none';
        selectedFiles = [];
      }
    });
  }

  if (uploadForm) {
    uploadForm.onsubmit = function (e) {
      e.preventDefault();
    };
  }

  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === this || e.target.classList.contains('img-modal-close')) {
        if (typeof closeModal === 'function') closeModal();
      }
    });
  }
};

// Initial call if starting on somepics
if (window.location.pathname.includes('somepics.html')) {
  if (typeof fetchImages === 'function') fetchImages();
  window.initSomePics();
}

window.openModal = openModal;
window.closeModal = closeModal;

// --- SPA Router & Persistent Music Player ---
(function () {
  // 1. SPA Navigation & Global Event Delegation Logic

  // Event Delegation for Image Previews (persists across tab navigation)
  document.body.addEventListener('click', (e) => {
    if (e.target.classList.contains('preview-img')) {
      const src = e.target.getAttribute('data-src') || e.target.src;
      if (typeof window.openModal === 'function') {
        window.openModal(src);
      }
    }
  });

  document.body.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    // Ignore external links, anchors, and empty hrefs
    if (!href || href.startsWith('http') || href.startsWith('#') || link.target === '_blank') return;

    e.preventDefault();
    navigateTo(href);
  });

  window.addEventListener('popstate', () => {
    navigateTo(window.location.pathname, false);
  });

  function cleanupAiState() {
    // Singleton Pattern: Tuyệt đối không terminate Worker ở đây
    // Để cho window.globalAiWorker tiếp tục xử lý ngầm khi user chuyển trang
    if (window.aiState) {
      // Chỉ gỡ bỏ callback cập nhật UI nội bộ trang pic-edit vì DOM chuẩn bị bị xóa
      window.aiState.onMessageCallback = null;
    }
  }

  async function navigateTo(url, push = true) {
    cleanupAiState();
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Network response was not ok');
      const htmlText = await response.text();

      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');

      // Replace main section (assuming all pages have a <section> for main content)
      const currentSection = document.querySelector('section');
      const newSection = doc.querySelector('section');
      if (currentSection && newSection) {
        currentSection.replaceWith(newSection);
      }

      // Update body classes (for background color changes)
      document.body.className = doc.body.className;

      // Update Title
      document.title = doc.title;

      // Update Nav active states
      const nav = document.querySelector('nav');
      if (nav) {
        const newNav = doc.querySelector('nav');
        if (newNav) {
          nav.innerHTML = newNav.innerHTML;
        }
      }

      // Push state
      if (push) {
        history.pushState(null, '', url);
      }

      // Re-trigger page specific logic if needed
      if (url.includes('somepics.html')) {
        if (typeof fetchImages === 'function') fetchImages();
        if (typeof window.initSomePics === 'function') window.initSomePics();
      }

      if (url.includes('pic-edit.html')) {
        // Load ONNX runtime dynamically if not present
        if (!document.querySelector('script[src="pic-edit.js"]')) {
          const script = document.createElement('script');
          script.src = 'pic-edit.js';
          script.onload = () => { if (typeof window.initPicEdit === 'function') window.initPicEdit(); };
          document.body.appendChild(script);
        } else {
          if (typeof window.initPicEdit === 'function') window.initPicEdit();
        }
      }

      // Update Particles
      if (typeof window.updateParticles === 'function') {
        window.updateParticles();
      }

      // Scroll to top
      window.scrollTo(0, 0);

    } catch (error) {
      console.error('Failed to navigate:', error);
      // Fallback
      window.location.href = url;
    }
  }

  // 2. Inject YouTube API Script
  const tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  const firstScriptTag = document.getElementsByTagName('script')[0];
  if (firstScriptTag) {
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  } else {
    document.head.appendChild(tag);
  }

  // 3. Inject HTML for Welcome Overlay and Top-Left Music Controller
  const musicHtml = `
    <div id="yt-player-container" style="position: absolute; left: -9999px;"></div>
    
    <div id="welcome-overlay" class="music-welcome-overlay">
      <div class="music-welcome-content">
        <h2>Enhance Your Experience</h2>
        <p>This portfolio includes background music for a better vibe.</p>
        <button id="start-experience-btn">Start Experience</button>
      </div>
    </div>

    <div id="music-controller" class="music-controller">
      <div style="font-size: 0.75rem; color: rgba(255,255,255,0.6); text-align: center; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px;">Add your music</div>
      <div class="music-controller-top">
        <div class="music-controls">
          <button id="play-pause-btn" aria-label="Play/Pause"><i class="fa-solid fa-play"></i></button>
          <button id="loop-mode-btn" aria-label="Loop Mode" title="Loop All"><i class="fa-solid fa-repeat"></i></button>
          <button id="playlist-toggle-btn" aria-label="Toggle Playlist"><i class="fa-solid fa-list-ul"></i></button>
          <div class="volume-control-wrapper">
             <i id="volume-icon" class="fa-solid fa-volume-high"></i>
             <div class="volume-slider-container">
               <input type="range" id="volume-slider" min="0" max="100" value="50">
             </div>
          </div>
        </div>
        <div class="music-info">
          <div class="marquee-container">
            <span id="music-status">Ready to play: Xương rồng - dangrangto</span>
          </div>
        </div>
      </div>
      
      <div id="music-expanded-area" class="music-expanded-area">
        <div class="music-search-container">
          <input type="text" id="music-search-input" placeholder="Search for a song...">
          <button id="music-search-btn"><i class="fa-solid fa-magnifying-glass"></i></button>
        </div>
        <div id="music-search-results" class="music-search-results">
          <!-- Results will be injected here -->
        </div>
        
        <!-- Playlist Panel -->
        <div id="music-playlist-panel" class="music-playlist-panel">
          <h4>My Playlist <button id="playlist-close-btn"><i class="fa-solid fa-times"></i></button></h4>
          <div id="music-playlist-items">
            <!-- Playlist items injected here -->
          </div>
        </div>
      </div>
    </div>
  `;
  // Only inject if it doesn't already exist
  if (!document.getElementById('music-controller')) {
    document.body.insertAdjacentHTML('beforeend', musicHtml);
  }

  // 4. YouTube API logic & Search
  window.musicPlayer = null;
  const defaultVideoId = '4jjOH2FR6-E';

  window.onYouTubeIframeAPIReady = function () {
    window.musicPlayer = new YT.Player('yt-player-container', {
      height: '10',
      width: '10',
      videoId: defaultVideoId,
      playerVars: {
        'controls': 0,
        'autoplay': 0,
        'rel': 0,
        'showinfo': 0
      },
      events: {
        'onReady': onPlayerReady,
        'onStateChange': onPlayerStateChange
      }
    });
  };

  function onPlayerReady(event) {
    const startBtn = document.getElementById('start-experience-btn');
    const overlay = document.getElementById('welcome-overlay');
    const controller = document.getElementById('music-controller');

    // Cursor effect on welcome overlay
    const cursor = document.querySelector('.cursor');
    if (overlay && cursor) {
      overlay.addEventListener('mouseover', () => cursor.classList.add('modal-active'));
      overlay.addEventListener('mouseout', () => cursor.classList.remove('modal-active'));

      // Cleanup cursor if overlay is clicked and disappears while hovered
      startBtn.addEventListener('click', () => {
        cursor.classList.remove('modal-active');
      });
    }

    const playPauseBtn = document.getElementById('play-pause-btn');

    const searchInput = document.getElementById('music-search-input');
    const searchBtn = document.getElementById('music-search-btn');
    const resultsContainer = document.getElementById('music-search-results');

    const playlistToggleBtn = document.getElementById('playlist-toggle-btn');
    const playlistCloseBtn = document.getElementById('playlist-close-btn');
    const loopModeBtn = document.getElementById('loop-mode-btn');
    const playlistPanel = document.getElementById('music-playlist-panel');
    const playlistItemsContainer = document.getElementById('music-playlist-items');
    const expandedArea = document.getElementById('music-expanded-area');
    const volumeSlider = document.getElementById('volume-slider');
    const volumeIcon = document.getElementById('volume-icon');

    // Volume State
    const savedVolume = localStorage.getItem('portfolio_music_volume');
    const initialVolume = savedVolume ? parseInt(savedVolume) : 50;
    volumeSlider.value = initialVolume;
    window.musicPlayer.setVolume(initialVolume);

    function updateVolumeIcon(vol) {
      if (vol === 0) {
        volumeIcon.className = 'fa-solid fa-volume-xmark';
      } else if (vol < 50) {
        volumeIcon.className = 'fa-solid fa-volume-low';
      } else {
        volumeIcon.className = 'fa-solid fa-volume-high';
      }
    }
    updateVolumeIcon(initialVolume);

    volumeSlider.addEventListener('input', (e) => {
      const vol = parseInt(e.target.value);
      if (window.musicPlayer && typeof window.musicPlayer.setVolume === 'function') {
        window.musicPlayer.setVolume(vol);
      }
      updateVolumeIcon(vol);
      localStorage.setItem('portfolio_music_volume', vol);
    });

    // Playlist State
    const savedPlaylist = localStorage.getItem('portfolio_playlist');
    window.myPlaylist = savedPlaylist ? JSON.parse(savedPlaylist) : [];
    window.currentPlaylistIndex = -1;
    window.loopMode = 'loop-all'; // 'loop-all', 'loop-one', 'shuffle'

    function savePlaylist() {
      localStorage.setItem('portfolio_playlist', JSON.stringify(window.myPlaylist));
    }

    playlistToggleBtn.addEventListener('click', () => {
      expandedArea.classList.toggle('open');
    });

    playlistCloseBtn.addEventListener('click', () => {
      expandedArea.classList.remove('open');
    });

    // Loop Mode Toggle
    loopModeBtn.addEventListener('click', () => {
      if (window.loopMode === 'loop-all') {
        window.loopMode = 'loop-one';
        loopModeBtn.innerHTML = `
          <i class="fa-solid fa-repeat" style="color: #00f2fe;"></i>
          <span style="font-size: 0.6rem; position: absolute; font-weight: 800; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #00f2fe; background: #1a1a1a; border-radius: 50%; width: 12px; height: 12px; display: flex; align-items: center; justify-content: center; line-height: 1;">1</span>
        `;
        loopModeBtn.title = 'Loop One';
        loopModeBtn.style.position = 'relative'; // to handle absolute span
      } else if (window.loopMode === 'loop-one') {
        window.loopMode = 'shuffle';
        loopModeBtn.innerHTML = '<i class="fa-solid fa-shuffle"></i>';
        loopModeBtn.title = 'Shuffle';
      } else {
        window.loopMode = 'loop-all';
        loopModeBtn.innerHTML = '<i class="fa-solid fa-repeat"></i>';
        loopModeBtn.title = 'Loop All';
      }
    });

    // Play/Pause Button Logic
    playPauseBtn.addEventListener('click', () => {
      if (!window.musicPlayer) return;
      if (window.musicPlayer.getPlayerState() === YT.PlayerState.PLAYING) {
        window.musicPlayer.pauseVideo();
      } else {
        window.musicPlayer.playVideo();
      }
    });

    window.renderPlaylist = function () {
      playlistItemsContainer.innerHTML = '';
      if (window.myPlaylist.length === 0) {
        playlistItemsContainer.innerHTML = '<div style="color: #888; font-size: 0.8rem; text-align: center; padding: 10px;">Empty Playlist</div>';
        return;
      }

      window.myPlaylist.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'playlist-item';
        if (index === window.currentPlaylistIndex) div.classList.add('active');

        div.innerHTML = `
          <img src="${item.thumbnail}" alt="thumb">
          <div class="playlist-item-title">${item.title}</div>
          <button class="delete-playlist-btn" title="Remove"><i class="fa-solid fa-trash"></i></button>
        `;

        // Play when clicking the title/thumbnail
        div.querySelector('img').addEventListener('click', () => playItem(index, item));
        div.querySelector('.playlist-item-title').addEventListener('click', () => playItem(index, item));

        // Delete item logic
        div.querySelector('.delete-playlist-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          window.myPlaylist.splice(index, 1);
          savePlaylist(); // Save after deleting

          if (window.currentPlaylistIndex === index) {
            // Deleted the currently playing track
            if (window.myPlaylist.length > 0) {
              // Wrap around if it was the last item
              if (window.currentPlaylistIndex >= window.myPlaylist.length) {
                window.currentPlaylistIndex = 0;
              }
              const nextItem = window.myPlaylist[window.currentPlaylistIndex];
              window.musicPlayer.loadVideoById(nextItem.videoId);
              document.getElementById('music-status').innerText = `Playing: ${nextItem.title}`;
            } else {
              // Deleted the last item, stop playback and revert to default
              window.currentPlaylistIndex = -1;
              window.musicPlayer.loadVideoById(defaultVideoId);
              window.musicPlayer.pauseVideo();
              document.getElementById('music-status').innerText = 'Default: Xương rồng - dangrangto';
            }
          } else if (window.currentPlaylistIndex > index) {
            // Shift index if deleted item was before current
            window.currentPlaylistIndex--;
          }
          window.renderPlaylist();
        });

        function playItem(idx, itm) {
          window.currentPlaylistIndex = idx;
          window.musicPlayer.loadVideoById(itm.videoId);
          document.getElementById('music-status').innerText = `Playing: ${itm.title}`;
          window.renderPlaylist();
          playlistPanel.classList.remove('open'); // Auto-close on play
        }

        playlistItemsContainer.appendChild(div);
      });
    };

    window.renderPlaylist();

    const musicStarted = sessionStorage.getItem('musicStarted');
    if (musicStarted === 'true') {
      overlay.style.display = 'none';
      controller.classList.add('visible');
      if (window.myPlaylist.length > 0) {
        window.currentPlaylistIndex = 0;
        const item = window.myPlaylist[0];
        window.musicPlayer.loadVideoById(item.videoId);
        document.getElementById('music-status').innerText = `Playing: ${item.title}`;
      } else {
        window.musicPlayer.playVideo();
        document.getElementById('music-status').innerText = 'Playing: Xương rồng - dangrangto';
      }
    }

    startBtn.addEventListener('click', () => {
      sessionStorage.setItem('musicStarted', 'true');
      if (window.myPlaylist.length > 0) {
        window.currentPlaylistIndex = 0;
        const item = window.myPlaylist[0];
        window.musicPlayer.loadVideoById(item.videoId);
        document.getElementById('music-status').innerText = `Playing: ${item.title}`;
      } else {
        window.musicPlayer.playVideo();
        document.getElementById('music-status').innerText = 'Playing: Xương rồng - dangrangto';
      }
      overlay.classList.add('fade-out');
      setTimeout(() => {
        overlay.style.display = 'none';
      }, 500);
      controller.classList.add('visible');
    });

    playPauseBtn.addEventListener('click', () => {
      if (!window.musicPlayer || typeof window.musicPlayer.getPlayerState !== 'function') return;
      const state = window.musicPlayer.getPlayerState();
      if (state === YT.PlayerState.PLAYING) {
        window.musicPlayer.pauseVideo();
      } else {
        window.musicPlayer.playVideo();
      }
    });

    // Search Logic
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') performSearch();
    });

    async function performSearch() {
      const query = searchInput.value.trim();
      if (!query) return;

      searchBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

      try {
        const url = `${API_BASE}/youtube-search?q=${encodeURIComponent(query)}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.items && data.items.length > 0) {
          renderSearchResults(data.items);
        } else {
          resultsContainer.innerHTML = '<span style="color:white; padding:5px;">No results found.</span>';
          resultsContainer.classList.add('active');
        }
      } catch (error) {
        console.error("Search error:", error);
        resultsContainer.innerHTML = '<span style="color:red; padding:5px;">Search failed.</span>';
        resultsContainer.classList.add('active');
      } finally {
        searchBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i>';
      }
    }

    function renderSearchResults(items) {
      resultsContainer.innerHTML = ''; // clear previous

      items.forEach(item => {
        const videoId = item.id.videoId;
        // Strict filter: skip if no videoId (e.g. channel or playlist)
        if (!videoId) return;

        const title = item.snippet.title;
        const thumbnail = item.snippet.thumbnails.default.url;

        const div = document.createElement('div');
        div.className = 'search-result-item';
        div.innerHTML = `
            <img src="${thumbnail}" alt="thumb">
            <span>${title}</span>
            <div class="search-result-actions">
              <button class="add-playlist-btn" title="Add to Playlist"><i class="fa-solid fa-plus"></i></button>
            </div>
        `;

        // Click on the image/title to play immediately
        div.querySelector('img').addEventListener('click', playImmediately);
        div.querySelector('span').addEventListener('click', playImmediately);

        function playImmediately() {
          window.musicPlayer.loadVideoById(videoId);
          document.getElementById('music-status').innerText = `Playing: ${title}`;
          resultsContainer.classList.remove('active'); // hide results
          searchInput.value = '';
          expandedArea.classList.remove('open'); // hide expanded area if open

          // If not in playlist, add and set index
          const existingIndex = window.myPlaylist.findIndex(v => v.videoId === videoId);
          if (existingIndex === -1) {
            window.myPlaylist.push({ videoId, title, thumbnail });
            savePlaylist(); // Save after adding
            window.currentPlaylistIndex = window.myPlaylist.length - 1;
            window.renderPlaylist();
          } else {
            window.currentPlaylistIndex = existingIndex;
            window.renderPlaylist();
          }
        }

        // Add to playlist logic
        const addBtn = div.querySelector('.add-playlist-btn');
        addBtn.addEventListener('click', (e) => {
          e.stopPropagation(); // prevent bubbling to the item

          const existingIndex = window.myPlaylist.findIndex(v => v.videoId === videoId);
          if (existingIndex !== -1) {
            alert('Bài hát này đã có trong Playlist rồi!');
            return;
          }

          window.myPlaylist.push({ videoId, title, thumbnail });
          savePlaylist(); // Save after adding
          window.renderPlaylist();

          // Auto-play if it's the first song being added
          if (window.myPlaylist.length === 1 && window.currentPlaylistIndex === -1) {
            window.currentPlaylistIndex = 0;
            window.musicPlayer.loadVideoById(videoId);
            document.getElementById('music-status').innerText = `Playing: ${title}`;
          }
          savePlaylist(); // Save after adding
          window.renderPlaylist();

          // Feedback effect
          addBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
          setTimeout(() => { addBtn.innerHTML = '<i class="fa-solid fa-plus"></i>'; }, 1000);
        });

        resultsContainer.appendChild(div);
      });

      resultsContainer.classList.add('active');
    }
  }

  function onPlayerStateChange(event) {
    const playPauseBtn = document.getElementById('play-pause-btn');
    const statusText = document.getElementById('music-status');

    if (event.data === YT.PlayerState.PLAYING) {
      playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
      if (statusText.innerText.includes('Ready') || statusText.innerText.includes('Paused')) {
        if (window.currentPlaylistIndex >= 0 && window.myPlaylist[window.currentPlaylistIndex]) {
          statusText.innerText = `Playing: ${window.myPlaylist[window.currentPlaylistIndex].title}`;
        } else {
          statusText.innerText = 'Default: Xương rồng - dangrangto';
        }
      }
    } else if (event.data === YT.PlayerState.PAUSED) {
      playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
      if (statusText.innerText.startsWith('Playing:')) {
        statusText.innerText = statusText.innerText.replace('Playing:', 'Paused:');
      } else if (statusText.innerText.startsWith('Default:')) {
        statusText.innerText = statusText.innerText.replace('Default:', 'Paused: Default');
      }
    } else if (event.data === YT.PlayerState.ENDED) {
      // Auto-play logic using myPlaylist
      if (window.myPlaylist.length > 0) {

        if (window.loopMode === 'loop-one') {
          // Play the same song
          const sameSong = window.myPlaylist[window.currentPlaylistIndex];
          window.musicPlayer.loadVideoById(sameSong.videoId);
          statusText.innerText = `Playing: ${sameSong.title}`;
        } else if (window.loopMode === 'shuffle') {
          // Pick a random song
          let nextIdx = Math.floor(Math.random() * window.myPlaylist.length);
          // Try not to play same song if length > 1
          if (window.myPlaylist.length > 1 && nextIdx === window.currentPlaylistIndex) {
            nextIdx = (nextIdx + 1) % window.myPlaylist.length;
          }
          window.currentPlaylistIndex = nextIdx;
          const nextSong = window.myPlaylist[window.currentPlaylistIndex];
          window.musicPlayer.loadVideoById(nextSong.videoId);
          statusText.innerText = `Playing: ${nextSong.title}`;
        } else {
          // loop-all
          window.currentPlaylistIndex++;
          // Loop back to start if it reaches the end
          if (window.currentPlaylistIndex >= window.myPlaylist.length) {
            window.currentPlaylistIndex = 0;
          }

          const nextSong = window.myPlaylist[window.currentPlaylistIndex];
          window.musicPlayer.loadVideoById(nextSong.videoId);
          statusText.innerText = `Playing: ${nextSong.title}`;
        }

        window.renderPlaylist();
      } else {
        // If no playlist, just loop the same default video
        window.musicPlayer.seekTo(0);
        window.musicPlayer.playVideo();
      }
    }
  }
})();

// --- High Performance Particle Engine (Antigravity Theme) ---
(function () {
  const canvas = document.createElement('canvas');
  canvas.id = 'bg-canvas';
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d', { alpha: true });
  let width, height;
  let particles = [];
  let currentTheme = '';

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  window.addEventListener('resize', resize);
  resize();

  class Particle {
    constructor(theme) {
      this.theme = theme;
      this.reset();
    }

    reset() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;

      if (this.theme === 'home-page') { // Stars
        this.size = Math.random() * 2;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.color = `rgba(255, 255, 255, ${Math.random()})`;
      } else if (this.theme === 'profile-page') { // Constellations / Nodes
        this.size = Math.random() * 3 + 1;
        this.vx = (Math.random() - 0.5) * 1;
        this.vy = (Math.random() - 0.5) * 1;
        this.color = `rgba(100, 200, 255, ${Math.random() * 0.5 + 0.2})`;
      } else if (this.theme === 'projects-page') { // Digital Rain / Data
        this.size = Math.random() * 2 + 1;
        this.vx = 0;
        this.vy = Math.random() * 3 + 1; // Falling down
        this.y = Math.random() * height - height; // Start above
        this.color = `rgba(255, 100, 200, ${Math.random() * 0.5 + 0.2})`;
      } else { // somepics-page or other -> Bubbles
        this.size = Math.random() * 10 + 2;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = -(Math.random() * 1 + 0.5); // Floating up (Antigravity)
        this.y = height + this.size; // Start below
        this.color = `rgba(255, 255, 255, ${Math.random() * 0.3})`;
      }
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;

      // Screen wrap or reset
      if (this.theme === 'projects-page') {
        if (this.y > height) this.reset();
      } else if (this.theme === 'somepics-page' || this.theme === 'pic-edit-page') {
        if (this.y < -this.size) this.reset();
      } else {
        if (this.x < 0) this.x = width;
        if (this.x > width) this.x = 0;
        if (this.y < 0) this.y = height;
        if (this.y > height) this.y = 0;
      }
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
    }
  }

  window.updateParticles = function () {
    let newTheme = document.body.className;
    // Just handle the main pages
    if (newTheme.includes('home')) newTheme = 'home-page';
    else if (newTheme.includes('profile')) newTheme = 'profile-page';
    else if (newTheme.includes('projects')) newTheme = 'projects-page';
    else newTheme = 'somepics-page';

    if (currentTheme !== newTheme) {
      currentTheme = newTheme;
      particles = [];
      let numParticles = 100;
      if (currentTheme === 'home-page') numParticles = 150;
      if (currentTheme === 'projects-page') numParticles = 30; // Reduced for performance
      if (currentTheme === 'profile-page') numParticles = 60;

      for (let i = 0; i < numParticles; i++) {
        particles.push(new Particle(currentTheme));
      }
    }
  };

  // Initial setup
  window.updateParticles();

  // High-performance animation loop
  function animate() {
    requestAnimationFrame(animate);

    // Pause rendering if welcome overlay is active to save GPU
    const overlay = document.getElementById('welcome-overlay');
    if (overlay && overlay.style.display !== 'none' && !overlay.classList.contains('fade-out')) {
      return;
    }

    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
      particles[i].update();
      particles[i].draw();
    }

    // Draw lines for profile page (constellation effect)
    if (currentTheme === 'profile-page') {
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = dx * dx + dy * dy;
          if (dist < 10000) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(100, 200, 255, ${1 - dist / 10000})`;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
    }
  }

  animate();
})();