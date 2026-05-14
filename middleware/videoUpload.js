const multer = require("multer");

const allowedVideoTypes = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

const fileFilter = (req, file, cb) => {
  if (!allowedVideoTypes.includes(file.mimetype)) {
    return cb(new Error("Only MP4, WEBM, and MOV videos are allowed."), false);
  }

  cb(null, true);
};

const videoUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});

module.exports = videoUpload;
