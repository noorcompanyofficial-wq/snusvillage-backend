require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Product = require("../models/Products");
const { hasCloudinaryConfig, storeProductImages } = require("../utils/productImages");

function isLocalUpload(value) {
  return typeof value === "string" && value.startsWith("/uploads/");
}

function fileToUploadObject(imagePath) {
  const absolutePath = path.join(__dirname, "..", "public", imagePath);

  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  const ext = path.extname(absolutePath).toLowerCase();
  const mimetype =
    {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".avif": "image/avif",
    }[ext] || "image/jpeg";

  return {
    originalname: path.basename(absolutePath),
    mimetype,
    buffer: fs.readFileSync(absolutePath),
  };
}

async function migrateProductImages() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required");
  }

  if (!hasCloudinaryConfig()) {
    throw new Error("Cloudinary env vars are required");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const products = await Product.find({ images: { $elemMatch: { $regex: "^/uploads/" } } });
  let changedProducts = 0;
  let uploadedImages = 0;
  let missingImages = 0;

  for (const product of products) {
    const nextImages = [];
    let changed = false;

    for (const image of product.images || []) {
      if (!isLocalUpload(image)) {
        nextImages.push(image);
        continue;
      }

      const uploadObject = fileToUploadObject(image);

      if (!uploadObject) {
        missingImages += 1;
        nextImages.push(image);
        console.log(`Missing local file for ${product.name}: ${image}`);
        continue;
      }

      const [cloudinaryUrl] = await storeProductImages([uploadObject]);
      nextImages.push(cloudinaryUrl);
      changed = true;
      uploadedImages += 1;
      console.log(`Uploaded ${product.name}: ${image}`);
    }

    if (changed) {
      product.images = nextImages;
      await product.save();
      changedProducts += 1;
    }
  }

  await mongoose.disconnect();

  console.log(
    `Done. Products updated: ${changedProducts}. Images uploaded: ${uploadedImages}. Missing files: ${missingImages}.`
  );
}

migrateProductImages().catch(async (err) => {
  console.error(err.message);

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  process.exit(1);
});
