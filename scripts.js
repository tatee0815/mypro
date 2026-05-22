const menuBtn = document.querySelector('.menu-toggle');
const nav = document.querySelector('nav');
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api';
const FIXED_PASSWORD = '0815'; // Chuyển sang server-side cho production

const modal = document.getElementById('img-modal');
const img = document.getElementById('img-modal-img');

//delete
const deleteModal = document.getElementById('delete-modal');
const deleteModalPasswordInput = document.getElementById('delete-modal-password-input');
const deleteModalError = document.getElementById('delete-modal-error');
const deleteModalYesBtn = document.getElementById('delete-modal-yes');
const deleteModalNoBtn = document.getElementById('delete-modal-no');

//upload
const uploadModal = document.getElementById('upload-modal');
const uploadModalPreviewImg = document.getElementById('upload-modal-preview-img');
const uploadModalPasswordInput = document.getElementById('upload-modal-password-input');
const uploadModalError = document.getElementById('upload-modal-error');
const uploadModalYesBtn = document.getElementById('upload-modal-yes');
const uploadModalNoBtn = document.getElementById('upload-modal-no');

// Cursor
const cursor = document.querySelector('.cursor');

window.addEventListener('mousemove', (e) => {
    const posX = e.clientX;
    const posY = e.clientY;

    cursor.style.left = `${posX - 15}px`;
    cursor.style.top = `${posY - 15}px`;
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
  if (!modal || !img || !deleteModal || !uploadModal) {
    console.error('Không tìm thấy các phần tử modal');
    return;
  }
  img.src = imgSrc;
  img.style.display = 'block';
  deleteModal.style.display = 'none';
  uploadModal.style.display = 'none';
  modal.classList.add('active');

  modal.querySelector('.img-modal-close').onclick = closeModal;
  modal.onclick = function(e) {
    if (e.target === modal) closeModal();
  };
}

function closeModal() {
  if (modal) {
    modal.classList.remove('active');
    if (img) img.style.display = 'none';
    if (deleteModal) deleteModal.style.display = 'none';
    if (deleteModalPasswordInput) deleteModalPasswordInput.value = '';
    if (deleteModalError) deleteModalError.style.display = 'none';
    if (uploadModal) uploadModal.style.display = 'none';
    if (uploadModalPreviewImg) uploadModalPreviewImg.src = '';
    if (uploadModalPasswordInput) uploadModalPasswordInput.value = '';
    if (uploadModalError) uploadModalError.style.display = 'none';
  }
}

function openDeleteModal(callback) {
  if (!modal || !deleteModal || !deleteModalPasswordInput || !deleteModalYesBtn || !deleteModalNoBtn) {
    console.error('Không tìm thấy các phần tử modal xóa');
    return;
  }

  img.style.display = 'none';
  deleteModal.style.display = 'block';
  if (uploadModal) uploadModal.style.display = 'none';
  modal.classList.add('active');
  deleteModalPasswordInput.value = '';
  deleteModalError.style.display = 'none';
  deleteModalPasswordInput.focus();

  deleteModalYesBtn.onclick = () => {
    const pwd = deleteModalPasswordInput.value;
    if (!pwd || pwd !== FIXED_PASSWORD) {
      deleteModalError.style.display = 'block';
      deleteModalPasswordInput.value = '';
      deleteModalPasswordInput.focus();
      return;
    }
    deleteModalError.style.display = 'none';
    closeModal();
    callback();
  };

  deleteModalNoBtn.onclick = closeModal;
}

function openUploadModal(imgSrc, callback) {
  if (!modal || !uploadModal || !uploadModalPreviewImg || !uploadModalPasswordInput || !uploadModalYesBtn || !uploadModalNoBtn) {
    console.error('Không tìm thấy các phần tử modal upload');
    return;
  }

  img.style.display = 'none';
  if (deleteModal) deleteModal.style.display = 'none';
  uploadModal.style.display = 'block';
  modal.classList.add('active');
  uploadModalPreviewImg.src = imgSrc;
  uploadModalPasswordInput.value = '';
  uploadModalError.style.display = 'none';
  uploadModalPasswordInput.focus();

  uploadModalYesBtn.onclick = () => {
    const pwd = uploadModalPasswordInput.value;
    if (!pwd || pwd !== FIXED_PASSWORD) {
      uploadModalError.style.display = 'block';
      uploadModalPasswordInput.value = '';
      uploadModalPasswordInput.focus();
      return;
    }
    uploadModalError.style.display = 'none';
    closeModal();
    callback();
  };

  uploadModalNoBtn.onclick = closeModal;
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
      return `
        <div class="gallery-item" style="display:inline-block; position:relative;">
          <img src="${url}" alt="pic" style="cursor:pointer;" onclick="openModal('${url}')">
          <button onclick="deleteImage('${publicId}')" style="position:absolute; top:5px; right:5px; background:red; color:white; border:none; border-radius:50%; width:24px; height:24px; cursor:pointer;">×</button>
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

// Xử lý upload và xem trước ảnh
const uploadForm = document.getElementById('upload-form');
const imageInput = document.getElementById('image-input');
const fileChosen = document.getElementById('file-chosen');
const imgPreview = document.getElementById('img-preview');

if (imageInput && fileChosen && imgPreview) {
  let selectedFile = null; // Lưu file tạm thời
  imageInput.addEventListener('change', function() {
    if (this.files && this.files[0]) {
      selectedFile = this.files[0];
      const reader = new FileReader();
      reader.onload = function(e) {
        imgPreview.src = e.target.result;
        imgPreview.style.display = 'none';
        // Mở unified upload modal
        openUploadModal(e.target.result, async () => {
          const formData = new FormData();
          formData.append('image', selectedFile);
          try {
            const res = await fetch(`${API_BASE}/upload`, {
              method: 'POST',
              body: formData,
            });
            if (!res.ok) {
              throw new Error('Upload thất bại');
            }
            await fetchImages();
            imageInput.value = '';
            imgPreview.style.display = 'none';
            selectedFile = null;
          } catch (error) {
            console.error('Lỗi khi upload ảnh:', error.message);
            alert('Không thể tải ảnh lên. Lỗi: ' + error.message);
          }
        });
      };
      reader.readAsDataURL(selectedFile);
    } else {
      imgPreview.style.display = 'none';
      selectedFile = null;
    }
  });
}

if (uploadForm) {
  uploadForm.onsubmit = function(e) {
    e.preventDefault(); // Ngăn submit form mặc định
  };
  fetchImages();
}

if (modal) {
    modal.addEventListener('click', function(e) {
        if (e.target === this || e.target.classList.contains('img-modal-close')) {
            if (typeof closeModal === 'function') closeModal();
        }
    });
}

window.openModal = openModal;
window.closeModal = closeModal;