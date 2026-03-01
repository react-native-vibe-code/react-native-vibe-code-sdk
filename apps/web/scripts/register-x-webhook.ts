/**
 * One-time setup script to register the X webhook URL using API v2.
 *
 * Usage: pnpm run x-bot:register-webhook
 *
 * Required environment variables:
 * - TWITTER_BEARER_TOKEN: App-level bearer token for X API v2
 *
 * Important: TWITTER_WEBHOOK_SECRET in .env must be set to your app's
 * Consumer Secret (API Secret Key from OAuth 1.0 Keys in X console).
 * X uses this to validate CRC challenges and sign webhook payloads.
 *
 * The webhook URL is registered as: https://reactnativevibecode.com/api/x-bot
 */

const WEBHOOK_URL = 'https://reactnativevibecode.com/api/x-bot'

async function main() {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN
  if (!bearerToken) {
    console.error('ERROR: TWITTER_BEARER_TOKEN environment variable is required')
    console.error('Get it from: X Developer Console → App → Keys and Tokens → Bearer Token')
    process.exit(1)
  }

  const headers = {
    Authorization: `Bearer ${bearerToken}`,
    'Content-Type': 'application/json',
  }

  // Step 1: Check existing webhooks
  console.log('Checking existing webhooks...')
  const listRes = await fetch('https://api.x.com/2/webhooks', { headers })

  if (listRes.ok) {
    const data = await listRes.json()
    const existing = data.data || []

    if (existing.length > 0) {
      console.log(`Found ${existing.length} existing webhook(s):`)
      for (const wh of existing) {
        console.log(`  - ID: ${wh.id}, URL: ${wh.url}, Valid: ${wh.valid}`)
      }

      // Check if our URL is already registered
      const alreadyRegistered = existing.find(
        (wh: any) => wh.url === WEBHOOK_URL
      )
      if (alreadyRegistered) {
        console.log(`\nWebhook already registered with ID: ${alreadyRegistered.id}`)
        if (!alreadyRegistered.valid) {
          console.log('Webhook is not valid. Triggering CRC re-validation...')
          const crcRes = await fetch(
            `https://api.x.com/2/webhooks/${alreadyRegistered.id}`,
            { method: 'PUT', headers }
          )
          if (crcRes.ok) {
            console.log('CRC re-validation triggered successfully')
          } else {
            const err = await crcRes.text()
            console.error(`CRC re-validation failed: ${err}`)
          }
        }
        console.log('\nDone! Webhook is active.')
        return
      }
    }
  } else {
    const err = await listRes.text()
    console.log(`Could not list existing webhooks (${listRes.status}): ${err}`)
  }

  // Step 2: Register new webhook
  console.log(`\nRegistering webhook URL: ${WEBHOOK_URL}`)
  console.log('(X will send a CRC challenge to your endpoint — make sure it is deployed)')

  const registerRes = await fetch('https://api.x.com/2/webhooks', {
    method: 'POST',
    headers,
    body: JSON.stringify({ url: WEBHOOK_URL }),
  })

  if (!registerRes.ok) {
    const err = await registerRes.text()
    console.error(`\nFailed to register webhook: ${registerRes.status}`)
    console.error(err)
    console.error('\nCommon issues:')
    console.error('  - Endpoint not deployed or not publicly accessible')
    console.error('  - CRC challenge failed (check TWITTER_WEBHOOK_SECRET matches your Consumer Secret)')
    console.error('  - Bearer token invalid or missing permissions')
    console.error('  - URL includes a port (not allowed)')
    process.exit(1)
  }

  const webhook = await registerRes.json()
  const wh = webhook.data
  console.log(`\nWebhook registered successfully!`)
  console.log(`  ID: ${wh.id}`)
  console.log(`  URL: ${wh.url}`)
  console.log(`  Valid: ${wh.valid}`)
  console.log(`  Created: ${wh.created_at}`)

  console.log('\nDone! The webhook is now active and will receive mention events.')
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
