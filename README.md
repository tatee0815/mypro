# Tatee Portfolio & Web Application

Welcome to the personal portfolio and web application of **Tatee** - a Game Developer with a passion for crafting immersive worlds, engaging gameplay experiences, and full-stack web solutions. 

This project serves as both a personal portfolio to showcase my projects and skills, as well as a functional web application featuring an AI-integrated image editor, a cloud-based image gallery, and a custom YouTube music player.

## 🌟 Features

- **Personal Portfolio:** Detailed sections about my background, skills, and past projects as a game developer.
- **Some Pics (Image Gallery):** A dynamic image gallery where users can view, upload, and delete images. Images are securely hosted and managed using **Cloudinary**. The gallery is optimized with Cloudinary's dynamic transformations to deliver ultra-fast WebP thumbnails.
- **Pic Edit (AI Image Editor):** A powerful image processing tool offering AI backends:
  - **Browser-based (ONNX Runtime Web):** Runs AnimeGANv3 models instantly in your browser via WebAssembly (Hayao, Ghibli, Sketch styles).
  - Features an interactive side-by-side Comparison Mode and options to save results to Cloudinary (Single Photo or Before/After format).
- **YouTube Music Player:** An integrated custom music player that allows users to search for music and play it directly from YouTube, powered by the **YouTube Data API v3**.
- **Responsive & Interactive UI:** Built as a Single Page Application (SPA) with modern CSS techniques including a custom interactive cursor, smooth animations, and full mobile responsiveness.

## 🛠️ Tech Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript, ONNX Runtime Web.
- **Backend:** Node.js, Express.js.
- **Cloud Storage:** Cloudinary (with on-the-fly image transformations).
- **APIs:** Google YouTube Data API v3.
- **Other Tools:** Multer, Cors, Dotenv.

## 🚀 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

You will need the following installed on your machine:
- [Node.js](https://nodejs.org/) (v14 or higher is recommended)
- [Git](https://git-scm.com/)

### Cloudinary & YouTube API Setup

To use the image upload/gallery features and the YouTube music player, you will need to set up free accounts and get API keys for Cloudinary and Google Cloud.

1. **Cloudinary:** Sign up at [cloudinary.com](https://cloudinary.com/), go to your dashboard, and get your Cloud Name, API Key, and API Secret.
2. **YouTube API:** Go to the [Google Cloud Console](https://console.cloud.google.com/), create a project, enable the **YouTube Data API v3**, and generate an API Key.

### Installation & Running Locally

1. **Clone the repository**
   ```bash
   git clone https://github.com/tatee0815/about-tatee.git
   cd about-tatee
   ```
   *(Note: replace the URL with your actual repository URL if different)*

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Environment Variables**
   Create a new file named `.env` in the root directory of the project and add your credentials:
   ```env
   PORT=3000
   CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
   CLOUDINARY_API_KEY=your_cloudinary_api_key
   CLOUDINARY_API_SECRET=your_cloudinary_api_secret
   YOUTUBE_API_KEY=your_youtube_api_key
   ```

4. **Start the server**
   ```bash
   npm start
   ```
   *(Alternatively, you can run `node server.js`)*

5. **View the website**
   Open your web browser and navigate to:
   ```
   http://localhost:3000
   ```

## 📁 Project Structure

```text
about-tatee/
├── models/                     # ONNX AI Models
│   ├── AnimeGANv3_Hayao_36.onnx
│   ├── AnimeGANv3_large_Ghibli_c1_e299.onnx
│   ├── AnimeGANv3_PortraitSketch_25.onnx
│   └── real_esrgan_x2.onnx
├── Pictures/                   # Local image assets for UI
├── middleware/                 # Backend middlewares (if any)
├── index.html                  # Main Portfolio Entry
├── profile.html                # About Me Page
├── projects.html               # Projects Showcase
├── somepics.html               # Cloudinary Gallery Page
├── pic-edit.html               # AI Image Editor Page (ONNX WASM)
├── style.css                   # Global Styles
├── scripts.js                  # Global and SPA routing logic
├── pic-edit.js                 # UI and Seamless Tiling logic for AI
├── ai-worker.js                # Web Worker for background ONNX inference
├── server.js                   # Node.js Express server (API & Static files)
├── .env                        # Environment variables (API Keys)
├── package.json                # Node.js dependencies
└── Procfile                    # Deployment config for Render/Heroku
```

## 🤝 Contact

- **Email:** htan2582@gmail.com
- **LinkedIn:** [Tấn Hoàng](https://www.linkedin.com/in/t%E1%BA%A5n-ho%C3%A0ng-a94692293/)
- **GitHub:** [tatee0815](https://github.com/tatee0815)
- **Instagram:** [@hv_.tan](https://www.instagram.com/hv_.tan/)
