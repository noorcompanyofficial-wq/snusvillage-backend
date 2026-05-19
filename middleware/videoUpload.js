const multer = require("multer");

const allowedMediaTypes = [
  // Videos
  "video/mp4",
  "video/webm",
  "video/quicktime",

  // Images for poster uploads
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/avif",
];

const fileFilter = (req, file, cb) => {
  if (!allowedMediaTypes.includes(file.mimetype)) {
    return cb(
      new Error("Only MP4, WEBM, MOV videos and JPG, PNG, WEBP, AVIF images are allowed."),
      false
    );
  }

  cb(null, true);
};

const videoUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: 75 * 1024 * 1024,
  },
});

module.exports = videoUpload;
