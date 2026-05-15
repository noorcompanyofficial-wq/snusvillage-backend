const multer = require("multer");

const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg", "image/avif"];

const fileFilter = (req, file, cb) => {
  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error("Only JPG, PNG, WEBP, and AVIF images are allowed."), false);
  }

  cb(null, true);
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
});

module.exports = upload;
