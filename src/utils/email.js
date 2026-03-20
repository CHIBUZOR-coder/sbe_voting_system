import nodemailer from 'nodemailer'

// Creates a transporter using SMTP credentials from .env
// Works with Gmail, Outlook, Mailgun SMTP, etc.
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT) || 587,
  secure: false, // true for port 465, false for 587
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
})

/**
 * Sends an email.
 *
 * @param {Object} options
 * @param {string} options.to      - Recipient email address
 * @param {string} options.subject - Email subject line
 * @param {string} options.html    - HTML body of the email
 *
 * Example:
 *   await sendEmail({
 *     to: 'user@example.com',
 *     subject: 'Verify your email',
 *     html: '<p>Click <a href="...">here</a> to verify</p>'
 *   })
 */
export const sendEmail = async ({ to, subject, html }) => {
  await transporter.sendMail({
    from: `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_USER}>`,
    to,
    subject,
    html
  })
}

// ─── Email Templates ─────────────────────────────────────────────────────────

/**
 * Sends a verification email after registration.
 * The link points to your frontend/API verify endpoint with the token.
 */
export const sendVerificationEmail = async (user, token) => {
  const verifyUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}`

  await sendEmail({
    to: user.email,
    subject: 'Verify Your Email — VoteApp',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
        <h2>Welcome to VoteApp, ${user.name}!</h2>
        <p>Please verify your email address to activate your account.</p>
        <a 
          href="${verifyUrl}" 
          style="
            display: inline-block;
            padding: 12px 24px;
            background: #4F46E5;
            color: white;
            border-radius: 6px;
            text-decoration: none;
            margin: 16px 0;
          "
        >
          Verify Email
        </a>
        <p>This link expires in <strong>1 hour</strong>.</p>
        <p>If you did not create an account, please ignore this email.</p>
      </div>
    `
  })
}

/**
 * Sends a password reset email.
 */
export const sendPasswordResetEmail = async (user, token) => {
  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`

  await sendEmail({
    to: user.email,
    subject: 'Reset Your Password — VoteApp',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
        <h2>Password Reset Request</h2>
        <p>Hi ${user.name}, we received a request to reset your password.</p>
        <a 
          href="${resetUrl}" 
          style="
            display: inline-block;
            padding: 12px 24px;
            background: #DC2626;
            color: white;
            border-radius: 6px;
            text-decoration: none;
            margin: 16px 0;
          "
        >
          Reset Password
        </a>
        <p>This link expires in <strong>1 hour</strong>.</p>
        <p>If you did not request this, please ignore this email.</p>
      </div>
    `
  })
}
