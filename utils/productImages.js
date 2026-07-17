const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const localUploadDir = path.join(__dirname, "..", "public", "uploads");

function hasCloudinaryConfig() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

function getSafeExt(file) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  return ext || `.${String(file.mimetype || "image/jpeg").split("/")[1] || "jpg"}`;
}

function saveLocalImage(file) {
  fs.mkdirSync(localUploadDir, { recursive: true });

  const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${getSafeExt(file)}`;
  const absolutePath = path.join(localUploadDir, uniqueName);

  fs.writeFileSync(absolutePath, file.buffer);

  return `/uploads/${uniqueName}`;
}

function signCloudinaryParams(params) {
  const sorted = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return crypto
    .createHash("sha1")
    .update(`${sorted}${process.env.CLOUDINARY_API_SECRET}`)
    .digest("hex");
}

async function uploadCloudinaryImage(file) {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = process.env.CLOUDINARY_FOLDER || "snus-village/products";
  const params = {
    folder,
    timestamp,
  };

  const body = new URLSearchParams();
  body.append("file", `data:${file.mimetype};base64,${file.buffer.toString("base64")}`);
  body.append("api_key", process.env.CLOUDINARY_API_KEY);
  body.append("folder", folder);
  body.append("timestamp", String(timestamp));
  body.append("signature", signCloudinaryParams(params));

  const response = await axios.post(
    `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`,
    body
  );

  return response.data.secure_url;
}

async function storeProductImages(files = []) {
  if (!files.length) return [];

  if (!hasCloudinaryConfig()) {
    return files.map(saveLocalImage);
  }

  return Promise.all(files.map(uploadCloudinaryImage));
}

module.exports = {
  storeProductImages,
  hasCloudinaryConfig,
};
