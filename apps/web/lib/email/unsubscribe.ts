import crypto from 'node:crypto'

export function generateUnsubscribeToken(email: string): string {
  const secret = process.env.BETTER_AUTH_SECRET!
  return crypto.createHmac('sha256', secret).update(email).digest('hex')
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const expected = generateUnsubscribeToken(email)
  if (expected.length !== token.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token))
}

export function getUnsubscribeUrl(email: string): string {
  const token = generateUnsubscribeToken(email)
  const baseUrl = process.env.NEXT_PUBLIC_PROD_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://reactnativevibecode.com'
  return `${baseUrl}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`
}
