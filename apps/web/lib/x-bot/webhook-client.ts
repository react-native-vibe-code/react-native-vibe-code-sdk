import crypto from 'crypto'

/**
 * Validate the webhook signature from X's webhook delivery.
 * X sends a `X-Twitter-Webhooks-Signature` header with format `sha256=<hmac>`.
 */
export function validateWebhookSignature(
  signature: string,
  body: string,
  secret: string
): boolean {
  const expectedSignature =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(body).digest('base64')

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}

/**
 * Handle a CRC (Challenge-Response Check) from X.
 * X sends GET requests with a `crc_token` query param to verify our endpoint.
 * We must respond with the HMAC-SHA256 of the token using our webhook secret.
 */
export function handleCrcChallenge(
  crcToken: string,
  secret: string
): { response_token: string } {
  const hmac = crypto
    .createHmac('sha256', secret)
    .update(crcToken)
    .digest('base64')

  return { response_token: `sha256=${hmac}` }
}
