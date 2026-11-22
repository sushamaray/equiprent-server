
import multer from "multer";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
    fields: 0,
    parts: 1,
  },

  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return callback(
        new Error(
          "Only JPEG, PNG and WebP images are allowed"
        )
      );
    }

    callback(null, true);
  },
});

// Verify actual file signatures instead of trusting
// the MIME type supplied by the browser.
const hasValidImageSignature = (file) => {
  const buffer = file.buffer;

  if (file.mimetype === "image/jpeg") {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }

  if (file.mimetype === "image/png") {
    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        Buffer.from([
          0x89, 0x50, 0x4e, 0x47,
          0x0d, 0x0a, 0x1a, 0x0a,
        ])
      )
    );
  }

  if (file.mimetype === "image/webp") {
    return (
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    );
  }

  return false;
};

export const receiveEquipmentImage = (
  req,
  res,
  next
) => {
  upload.single("image")(req, res, (error) => {
    if (error) {
      if (error instanceof multer.MulterError) {
        const status =
          error.code === "LIMIT_FILE_SIZE" ? 413 : 400;

        return res.status(status).json({
          success: false,
          message:
            error.code === "LIMIT_FILE_SIZE"
              ? "Image must not exceed 5 MB"
              : "Invalid image upload request",
        });
      }

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Image upload failed",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "An image file is required",
      });
    }

    if (!hasValidImageSignature(req.file)) {
      return res.status(400).json({
        success: false,
        message: "Invalid image file content",
      });
    }

    next();
  });
};