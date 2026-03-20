import express from 'express'
import dotenv from 'dotenv'
import { userRouter } from './src/router/userRouter.js'

const app = express()
const port = 5000

app.use("/", userRouter)


app.listen(() => {
  console.log(`listening at ${port}`)
})

