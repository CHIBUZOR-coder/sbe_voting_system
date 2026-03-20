import streamifier from 'streamifier'
import cloudinary from '../lib/cloudinary.js'

/**
 * Uploads a file buffer to Cloudinary.
 *
 * @param {Buffer} buffer - The file buffer from multer memoryStorage
 * @param {string} folder - The Cloudinary folder to upload into e.g. 'users', 'orgs', 'candidates'
 * @returns {Promise<{ url: string, publicId: string }>}
 *
 * Example:
 *   const { url, publicId } = await uploadToCloudinary(req.file.buffer, 'users')
 */
export const uploadToCloudinary = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) return reject(error)
        resolve({ url: result.secure_url, publicId: result.public_id })
      }
    )
    // Convert the buffer into a readable stream and pipe it to Cloudinary
    streamifier.createReadStream(buffer).pipe(uploadStream)
  })
}

/**
 * Deletes an image from Cloudinary using its publicId.
 * Safe to call even if publicId is null/undefined — it just skips.
 *
 * @param {string|null} publicId
 *
 * Example:
 *   await deleteFromCloudinary(user.avatarPublicId)
 */
export const deleteFromCloudinary = async publicId => {
  if (!publicId) return
  await cloudinary.uploader.destroy(publicId)
}
