const fs = require("fs");
const path = require("path");
const { storeProductImages } = require("./productImages");

const videoUploadDir = path.join(__dirname, "..", "public", "uploads", "homepage-videos");

function safeVideoExt(file) {
  const ext = path.extname(file.originalname || "").toLowerCase();

  if ([".mp4", ".webm", ".mov"].includes(ext)) {
    return ext;
  }

  if (file.mimetype === "video/webm") return ".webm";
  if (file.mimetype === "video/quicktime") return ".mov";

  return ".mp4";
}

function storeHomepageVideo(file) {
  fs.mkdirSync(videoUploadDir, { recursive: true });

  const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeVideoExt(file)}`;
  const absolutePath = path.join(videoUploadDir, uniqueName);

  fs.writeFileSync(absolutePath, file.buffer);

  return `/uploads/homepage-videos/${uniqueName}`;
}

async function storeHomepageImage(file) {
  const [storedPath] = await storeProductImages([file]);
  return storedPath || "";
}

module.exports = {
  storeHomepageVideo,
  storeHomepageImage,
};
