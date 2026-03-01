import { Resend } from 'resend'
import WelcomeEmail from './templates/welcome'

// Lazy initialization to avoid errors during Next.js build phase
let _resend: Resend | null = null
function getResend() {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable is required')
    }
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}

const FROM_EMAIL = 'Capsule <welcome@reactnativevibecode.com>'

export async function sendWelcomeEmail(user: { name: string; email: string }) {
  console.log('[Email] Sending welcome email to:', user.email)
  console.log('[Email] From:', FROM_EMAIL)

  const { data, error } = await getResend().emails.send({
    from: FROM_EMAIL,
    to: user.email,
    subject: 'Welcome to Capsule!',
    react: WelcomeEmail({ name: user.name }),
  })

  if (error) {
    console.error('[Email] Failed to send:', error)
    throw error
  }

  console.log('[Email] Sent successfully:', data)
  return data
}
