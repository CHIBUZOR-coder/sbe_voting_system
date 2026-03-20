import express from 'express'
import dotenv from 'dotenv'
import { registerUser } from '../controllers/userController.js'
const userRouter = express.Router()

userRouter.post('/register', registerUser)
export { userRouter }
