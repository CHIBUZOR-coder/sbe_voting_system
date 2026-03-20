import multer from 'multer'

// We use memoryStorage so the file lives in memory as a Buffer.
// We then pipe that buffer straight to Cloudinary using streamifier.
// This avoids saving any temp files to disk.
const storage = multer.memoryStorage()

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Only JPEG, JPG, PNG and WEBP images are allowed'), false)
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  }
})

export default upload
