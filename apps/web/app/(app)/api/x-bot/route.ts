import { NextRequest, NextResponse } from 'next/server'
import {
  validateWebhookSignature,
  handleCrcChallenge,
} from '@/lib/x-bot/webhook-client'
import { getAuthClient, processMention } from '@/lib/x-bot/process-mention'

// Config
const YOUR_USER_ID = '1832518730582020097' // Bot's numeric user ID
const TWITTER_WEBHOOK_SECRET = process.env.TWITTER_WEBHOOK_SECRET

/**
 * Extract media URLs from a v1.1 Account Activity webhook tweet object.
 */
function extractMediaFromWebhookTweet(tweet: any): string[] {
  const media = tweet.extended_entities?.media || tweet.entities?.media || []
  return media
    .filter((m: any) => m.type === 'photo')
    .map((m: any) => m.media_url_https || m.media_url)
    .filter(Boolean)
}

/**
 * GET handler — CRC Challenge Response
 * X sends GET requests to verify our webhook endpoint.
 * We respond with HMAC-SHA256 of the crc_token.
 */
export async function GET(request: NextRequest) {
  const crcToken = request.nextUrl.searchParams.get('crc_token')

  if (!crcToken) {
    return NextResponse.json(
      { error: 'Missing crc_token parameter' },
      { status: 400 }
    )
  }

  if (!TWITTER_WEBHOOK_SECRET) {
    console.error('[X-Bot] TWITTER_WEBHOOK_SECRET not configured')
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    )
  }

  console.log('[X-Bot] CRC challenge received')
  const response = handleCrcChallenge(crcToken, TWITTER_WEBHOOK_SECRET)
  return NextResponse.json(response)
}

/**
 * POST handler — Legacy Webhook Event Handler
 * Kept for backwards compatibility. Primary mention processing now uses polling via /api/x-bot/poll.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()

    // Validate webhook signature
    if (TWITTER_WEBHOOK_SECRET) {
      const signature = request.headers.get('x-twitter-webhooks-signature') || ''
      if (!signature || !validateWebhookSignature(signature, rawBody, TWITTER_WEBHOOK_SECRET)) {
        console.error('[X-Bot] Invalid webhook signature')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    const payload = JSON.parse(rawBody)

    // Only process tweet_create_events (mentions)
    const tweetEvents = payload.tweet_create_events
    if (!tweetEvents || !Array.isArray(tweetEvents) || tweetEvents.length === 0) {
      return NextResponse.json({ ok: true })
    }

    console.log(`[X-Bot] Webhook received ${tweetEvents.length} tweet events`)

    const url = new URL(request.url)
    const baseUrl = `${url.protocol}//${url.host}`
    const client = await getAuthClient()

    const results: Array<{
      tweetId: string
      action: string
      projectId?: string
      error?: string
    }> = []

    for (const tweet of tweetEvents) {
      const tweetId = tweet.id_str
      const text = tweet.text || tweet.full_text || ''
      const authorId = tweet.user?.id_str

      if (!tweetId || !authorId) continue

      const mentions = tweet.entities?.user_mentions || []
      const isMentioned = mentions.some(
        (m: any) => m.id_str === YOUR_USER_ID
      )

      if (!isMentioned) continue

      const mediaUrls = extractMediaFromWebhookTweet(tweet)

      const result = await processMention(
        { tweetId, text, authorId, mediaUrls },
        client,
        baseUrl
      )

      results.push({ tweetId, ...result })
    }

    return NextResponse.json({ success: true, results })
  } catch (error: any) {
    console.error('[X-Bot] Webhook error:', error)
    return NextResponse.json(
      { error: error.message || 'Webhook processing failed' },
      { status: 500 }
    )
  }
}
