/**
 * One-time setup script to register the X webhook URL
 * and create the account activity subscription.
 *
 * Usage: pnpm run x-bot:register-webhook
 *
 * Required environment variables:
 * - TWITTER_BEARER_TOKEN: App-level bearer token for X API
 * - TWITTER_WEBHOOK_SECRET: Secret for CRC validation (must match .env)
 *
 * The webhook URL is registered as: https://reactnativevibecode.com/api/x-bot
 */

const WEBHOOK_URL = 'https://reactnativevibecode.com/api/x-bot'
const ENVIRONMENT_NAME = 'production' // Account Activity API environment label

async function main() {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN
  if (!bearerToken) {
    console.error('ERROR: TWITTER_BEARER_TOKEN environment variable is required')
    process.exit(1)
  }

  const webhookSecret = process.env.TWITTER_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('ERROR: TWITTER_WEBHOOK_SECRET environment variable is required')
    process.exit(1)
  }

  const headers = {
    Authorization: `Bearer ${bearerToken}`,
    'Content-Type': 'application/json',
  }

  // Step 1: Check existing webhooks
  console.log('Checking existing webhooks...')
  const listRes = await fetch(
    `https://api.twitter.com/1.1/account_activity/all/${ENVIRONMENT_NAME}/webhooks.json`,
    { headers }
  )

  if (listRes.ok) {
    const existing = await listRes.json()
    if (Array.isArray(existing) && existing.length > 0) {
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
          console.log('Webhook is not valid. Triggering CRC validation...')
          const crcRes = await fetch(
            `https://api.twitter.com/1.1/account_activity/all/${ENVIRONMENT_NAME}/webhooks/${alreadyRegistered.id}.json`,
            { method: 'PUT', headers }
          )
          if (crcRes.ok) {
            console.log('CRC validation triggered successfully')
          } else {
            const err = await crcRes.text()
            console.error(`CRC validation failed: ${err}`)
          }
        }
        await createSubscription(headers)
        return
      }
    }
  } else {
    const err = await listRes.text()
    console.log(`Could not list existing webhooks: ${err}`)
  }

  // Step 2: Register new webhook
  console.log(`\nRegistering webhook URL: ${WEBHOOK_URL}`)
  const registerRes = await fetch(
    `https://api.twitter.com/1.1/account_activity/all/${ENVIRONMENT_NAME}/webhooks.json?url=${encodeURIComponent(WEBHOOK_URL)}`,
    { method: 'POST', headers }
  )

  if (!registerRes.ok) {
    const err = await registerRes.text()
    console.error(`Failed to register webhook: ${registerRes.status} ${err}`)
    process.exit(1)
  }

  const webhook = await registerRes.json()
  console.log(`Webhook registered successfully!`)
  console.log(`  ID: ${webhook.id}`)
  console.log(`  URL: ${webhook.url}`)
  console.log(`  Valid: ${webhook.valid}`)

  // Step 3: Create subscription
  await createSubscription(headers)

  console.log('\nDone! The webhook is now active.')
}

async function createSubscription(headers: Record<string, string>) {
  console.log('\nCreating account activity subscription...')
  const subRes = await fetch(
    `https://api.twitter.com/1.1/account_activity/all/${ENVIRONMENT_NAME}/subscriptions.json`,
    { method: 'POST', headers }
  )

  if (subRes.ok || subRes.status === 204) {
    console.log('Subscription created successfully!')
  } else if (subRes.status === 409) {
    console.log('Subscription already exists.')
  } else {
    const err = await subRes.text()
    console.error(`Failed to create subscription: ${subRes.status} ${err}`)
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
