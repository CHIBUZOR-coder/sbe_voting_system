import { Resend } from 'resend'
const resend = new Resend(process.env.RESEND_API_KEY)

/**
 * Sends an email.
 *
 * @param {Object} options
 * @param {string} options.to      - Recipient email address
 * @param {string} options.subject - Email subject line
 * @param {string} options.html    - HTML body of the email
 */
export const sendEmail = async ({ to, subject, html }) => {
  await resend.emails.send({
    from: `${process.env.MAIL_FROM_NAME} <noreply@zoeytech.site>`,
    to,
    subject,
    html
  })
}


// ─── Email Templates ─────────────────────────────────────────────────────────

/**
 * Sends a verification email after registration.
 */
export const sendVerificationEmail = async (user, token) => {
  // In email.js — encode token when building the link
  const verifyUrl = `${
    process.env.CLIENT_URL
  }/verify-email?token=${encodeURIComponent(token)}`

  await sendEmail({
    to: user.email,
    subject: 'Verify Your Email — SBE Voting System',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
        <h2>Welcome to SBE Voting System, ${user.name}!</h2>
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
  const resetUrl =  `${process.env.CLIENT_URL}/reset-password?token=${encodeURIComponent(token)}`


  await sendEmail({
    to: user.email,
    subject: 'Reset Your Password — SBE Voting System',
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

/**
 * Sends a vote confirmation email after a user successfully casts a vote.
 * Called fire-and-forget in voteController — does not block the vote response.
 *
 * @param {Object} user     - The logged-in user { name, email }
 * @param {Object} campaign - The campaign { title }
 */
export const sendVoteConfirmationEmail = async (user, campaign) => {
  await sendEmail({
    to: user.email,
    subject: `Vote Confirmed — ${campaign.title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
        <h2>Your Vote Has Been Cast! ✅</h2>
        <p>Hi ${user.name},</p>
        <p>
          Your vote in <strong>${campaign.title}</strong> has been 
          recorded successfully.
        </p>
        <div style="
          background: #f4f4f4;
          border-left: 4px solid #4F46E5;
          padding: 12px 16px;
          margin: 16px 0;
          border-radius: 4px;
        ">
          <p style="margin: 0;"><strong>Campaign:</strong> ${campaign.title}</p>
          <p style="margin: 8px 0 0;"><strong>Voted at:</strong> ${new Date().toUTCString()}</p>
        </div>
        <p>Your vote is <strong>anonymous</strong> — no one can trace your choice.</p>
        <p>Thank you for participating!</p>
        <p style="color: #999; font-size: 12px;">
          If you did not cast this vote, please contact support immediately.
        </p>
      </div>
    `
  })
}
