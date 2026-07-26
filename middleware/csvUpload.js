const multer = require("multer");

const allowedTypes = ["text/csv", "application/vnd.ms-excel", "application/csv", "text/plain"];

const fileFilter = (req, file, cb) => {
  const isCsvExt = /\.csv$/i.test(file.originalname || "");

  if (!allowedTypes.includes(file.mimetype) && !isCsvExt) {
    return cb(new Error("Only CSV files are allowed."), false);
  }

  cb(null, true);
};

const csvUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

module.exports = csvUpload;
