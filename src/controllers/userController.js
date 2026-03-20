import prisma from '../lib/prisma.js'
export const registerUser = async (req, res) => {
  const { email, name } = req.body
  try {
    //
    const existingUser = await prisma.user.findUnique({
      where: {
        email
      }
    })

    if (existingUser) {
      return res
        .status(400)
        .json({ success: false, message: 'User Already exist in database' })
    }

    const newUser = await prisma.user.create({ data: { name, email } })

    if (!newUser) {
      return res
        .status(400)
        .json({ success: false, message: 'unable to create user' })
    }

    return res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: newUser
    })
  } catch (error) {
    console.log('error:', error.message)
    return res
      .status(500)
      .json({
        success: false,
        message: 'internal server error, please try again later'
      })
  }
}
