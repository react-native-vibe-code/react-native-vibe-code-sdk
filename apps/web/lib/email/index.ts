import { Resend } from 'resend'
import WelcomeEmail from './templates/welcome'
import NewsletterEmail from './templates/newsletter_1'
import { getUnsubscribeUrl } from './unsubscribe'

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

const FROM_EMAIL = 'React Native Vibe Code <welcome@reactnativevibecode.com>'
const NEWSLETTER_FROM = 'React Native Vibe Code <newsletter@reactnativevibecode.com>'

export async function sendWelcomeEmail(user: { name: string; email: string }) {
  console.log('[Email] Sending welcome email to:', user.email)
  console.log('[Email] From:', FROM_EMAIL)

  const { data, error } = await getResend().emails.send({
    from: FROM_EMAIL,
    to: user.email,
    subject: 'Welcome to React Native Vibe Code!',
    react: WelcomeEmail({ name: user.name, unsubscribeUrl: getUnsubscribeUrl(user.email) }),
  })

  if (error) {
    console.error('[Email] Failed to send:', error)
    throw error
  }

  console.log('[Email] Sent successfully:', data)
  return data
}

export interface NewsletterOptions {
  subject: string
  issueNumber?: number
  issueDate?: string
  heading?: string
  intro?: string
  updates?: { title: string; description: string; linkUrl?: string; linkText?: string }[]
  closingTitle?: string
  closingText?: string
  ctaText?: string
  ctaUrl?: string
}

export async function sendNewsletter(
  recipients: string[],
  options: NewsletterOptions
) {
  const { subject, ...templateProps } = options
  console.log(
    `[Email] Sending newsletter to ${recipients.length} recipients`
  )

  // Resend batch supports up to 100 emails per call
  const batches: string[][] = []
  for (let i = 0; i < recipients.length; i += 100) {
    batches.push(recipients.slice(i, i + 100))
  }

  const results = []
  for (const batch of batches) {
    const emails = batch.map((to) => ({
      from: NEWSLETTER_FROM,
      to,
      subject,
      react: NewsletterEmail({ ...templateProps, unsubscribeUrl: getUnsubscribeUrl(to) }),
    }))

    const { data, error } = await getResend().batch.send(emails)
    if (error) {
      console.error('[Email] Newsletter batch failed:', error)
      throw error
    }
    results.push(data)
  }

  console.log(`[Email] Newsletter sent to ${recipients.length} recipients`)
  return results
}

export { WelcomeEmail, NewsletterEmail }
