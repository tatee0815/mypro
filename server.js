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

// Cấu hình multer để lưu tạm vào bộ nhớ
const upload = multer({ storage: multer.memoryStorage() });

// Phục vụ file tĩnh từ thư mục gốc
app.use(express.static('.'));

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

// API upload ảnh lên Cloudinary
app.post('/api/upload', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Không có file được tải lên' });
  }
  try {
    const result = await cloudinary.uploader.upload_stream({
      resource_type: 'image',
      folder: 'somepics'
    }, (error, result) => {
      if (error) {
        console.error('Lỗi khi upload lên Cloudinary:', error.message);
        return res.status(500).json({ error: 'Upload thất bại' });
      }
      res.json({ url: result.secure_url });
    }).end(req.file.buffer);
  } catch (error) {
    console.error('Lỗi khi upload lên Cloudinary:', error.message);
    res.status(500).json({ error: 'Upload thất bại' });
  }
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

// API upload ảnh AI đã xử lý lên Cloudinary (thư mục riêng theo model)
app.post('/api/upload-ai-edit', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Không có file được tải lên' });
  }

  // Lấy tên model từ request body, loại bỏ đuôi .onnx nếu có
  const modelName = req.body.model || 'unknown';
  const folderName = modelName.replace('.onnx', '');

  try {
    const result = await cloudinary.uploader.upload_stream({
      resource_type: 'image',
      folder: `AI_Edits/${folderName}`
    }, (error, result) => {
      if (error) {
        console.error('Lỗi khi upload lên Cloudinary:', error.message);
        return res.status(500).json({ error: 'Upload thất bại' });
      }
      res.json({ url: result.secure_url });
    }).end(req.file.buffer);
  } catch (error) {
    console.error('Lỗi khi upload lên Cloudinary:', error.message);
    res.status(500).json({ error: 'Upload thất bại' });
  }
});

// API gọi Python script để upscale ảnh (Upscayl/ncnn)
app.post('/api/upscayl', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Không có file được tải lên' });
  }

  const modelName = req.body.model || 'realesrgan-x4plus'; // Tên model mặc định
  
  // Tạo thư mục temp nếu chưa có
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  // Tạo tên file ngẫu nhiên
  const filename = Date.now() + '-' + Math.round(Math.random() * 1E9);
  const inputPath = path.join(tempDir, filename + '-in.png');
  const outputPath = path.join(tempDir, filename + '-out.png');

  // Lưu file từ buffer ra ổ cứng
  fs.writeFileSync(inputPath, req.file.buffer);

  // Gọi trực tiếp file thực thi C++ (NCNN Vulkan)
  const exeName = process.platform === 'win32' ? 'realesrgan-ncnn-vulkan.exe' : 'realesrgan-ncnn-vulkan';
  const exePath = path.join(__dirname, 'bin', exeName);

  const ncnnProcess = spawn(exePath, [
    '-i', inputPath,
    '-o', outputPath,
    '-n', modelName,
    '-m', path.join(__dirname, 'models')
  ]);

  let processError = '';

  ncnnProcess.stderr.on('data', (data) => {
    processError += data.toString();
    console.error(`NCNN Stderr: ${data}`);
  });

  ncnnProcess.on('close', async (code) => {
    if (code !== 0) {
      // Xóa file temp
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      return res.status(500).json({ error: 'Lỗi khi xử lý qua NCNN Engine', details: processError });
    }

    // Trả file ảnh trực tiếp về cho Frontend thay vì tự động upload Cloudinary
    if (fs.existsSync(outputPath)) {
      res.sendFile(outputPath, (err) => {
        if (err) {
          console.error('Lỗi khi gửi file về client:', err);
        }
        // Cleanup temp files sau khi gửi xong
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      });
    } else {
      res.status(500).json({ error: 'Không tìm thấy file output từ NCNN' });
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    }
  });
});

// Khởi động server
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
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