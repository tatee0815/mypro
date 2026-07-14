const express = require('express');
const multer = require('multer');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config();

// Khởi tạo Express app
const app = express();

// Lấy PORT từ biến môi trường hoặc mặc định là 3000
const PORT = process.env.PORT || 3000;

// Cấu hình Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Cấu hình CORS
app.use(cors());

// Phục vụ file tĩnh từ thư mục gốc
app.use(express.static('.'));

// Parse JSON payload (Thay cho Multer memoryStorage)
app.use(express.json());

// API cấp thông tin Cloudinary cho Frontend
app.get('/api/cloudinary-config', (req, res) => {
  res.json({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    upload_preset: 'unsigned_upload' // Lưu ý: Cần tạo unsigned upload preset trên Cloudinary dashboard
  });
});

// API lấy danh sách ảnh từ Cloudinary
app.get('/api/images', async (req, res) => {
  try {
    const result = await cloudinary.search
      .expression('folder:somepics')
      .max_results(100)
      .execute();
    const images = result.resources.map(resource => resource.secure_url);
    res.json(images);
  } catch (error) {
    console.error('Lỗi khi lấy ảnh từ Cloudinary:', error.message);
    res.status(500).json({ error: 'Không thể lấy danh sách ảnh' });
  }
});

// API ghi nhận ảnh upload từ Client
app.post('/api/upload', async (req, res) => {
  const { secure_url } = req.body;
  if (!secure_url) {
    return res.status(400).json({ error: 'Không có URL được tải lên' });
  }
  // Giả lập lưu vào DB
  console.log('Client đã upload thành công ảnh:', secure_url);
  res.json({ url: secure_url, success: true });
});

// API xóa ảnh từ Cloudinary
app.delete('/api/images/{*public_id}', async (req, res) => {
  let public_id = req.params.public_id;
  if (Array.isArray(public_id)) {
    public_id = public_id.join('/');
  }
  try {
    const result = await cloudinary.uploader.destroy(public_id, { resource_type: 'image' });
    if (result.result === 'ok') {
      res.json({ success: true });
    } else {
      throw new Error('Cloudinary xóa thất bại');
    }
  } catch (error) {
    console.error('Lỗi khi xóa ảnh từ Cloudinary:', error.message);
    res.status(404).json({ error: 'Ảnh không tồn tại hoặc xóa thất bại' });
  }
});

// API lấy danh sách ảnh AI đã xử lý từ thư mục AI_Edits
app.get('/api/images-ai-edit', async (req, res) => {
  try {
    const result = await cloudinary.api.resources({
      type: 'upload',
      prefix: 'AI_Edits/',
      max_results: 100,
    });
    const images = result.resources.map(resource => resource.secure_url);
    res.json(images);
  } catch (error) {
    console.error('Lỗi khi lấy ảnh AI từ Cloudinary:', error.message);
    res.status(500).json({ error: 'Không thể lấy danh sách ảnh' });
  }
});

// API ghi nhận ảnh AI đã xử lý từ Client
app.post('/api/upload-ai-edit', async (req, res) => {
  const { secure_url, model } = req.body;
  if (!secure_url) {
    return res.status(400).json({ error: 'Không có URL được tải lên' });
  }

  // Lấy tên model
  const modelName = model || 'unknown';

  // Giả lập lưu vào DB
  console.log(`Client đã upload ảnh AI (${modelName}) thành công:`, secure_url);
  res.json({ url: secure_url, success: true });
});



// Khởi động server
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});

// API dành riêng cho việc chống ngủ đông
app.get('/api/keep-awake', (req, res) => {
  res.status(200).send('Trẫm vẫn thức!');
});

// API xác thực mật khẩu
app.post('/api/verify-password', (req, res) => {
  const { password } = req.body;
  if (password === process.env.FIXED_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Mật khẩu không chính xác' });
  }
});

// API proxy tìm kiếm YouTube
app.get('/api/youtube-search', (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Thiếu từ khóa tìm kiếm' });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=5&q=${encodeURIComponent(query)}&type=video&key=${apiKey}`;

  const https = require('https');
  https.get(url, (apiRes) => {
    let data = '';
    apiRes.on('data', (chunk) => {
      data += chunk;
    });
    apiRes.on('end', () => {
      try {
        const parsedData = JSON.parse(data);
        if (apiRes.statusCode !== 200) {
          console.error('YouTube API Error Response:', parsedData);
          return res.status(apiRes.statusCode).json(parsedData);
        }
        res.json(parsedData);
      } catch (e) {
        res.status(500).json({ error: 'Lỗi parse dữ liệu' });
      }
    });
  }).on('error', (err) => {
    console.error('YouTube API error:', err);
    res.status(500).json({ error: 'Lỗi khi gọi YouTube API' });
  });
});