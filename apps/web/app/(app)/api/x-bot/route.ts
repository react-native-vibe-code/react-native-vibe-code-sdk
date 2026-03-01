import { Client, auth } from 'twitter-api-sdk'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { xBotReplies, xBotState, twitterLinks } from '@react-native-vibe-code/database'
import { eq } from 'drizzle-orm'
import { classifyTweet, quickAppRequestCheck } from '@/lib/x-bot/classify-tweet'
import {
  extractMediaUrls,
  downloadAndStoreTweetImages,
} from '@/lib/x-bot/extract-images'
import {
  canUserSendMessage,
  incrementMessageUsage,
} from '@react-native-vibe-code/payments/server'
import {
  validateWebhookSignature,
  handleCrcChallenge,
} from '@/lib/x-bot/webhook-client'

// Config
const YOUR_USER_ID = '1832518730582020097' // Bot's numeric user ID
const X_BOT_SECRET = process.env.X_BOT_SECRET
const TWITTER_WEBHOOK_SECRET = process.env.TWITTER_WEBHOOK_SECRET

// Reply for unlinked users
const UNLINKED_USER_REPLY =
  'To build apps with React Native Vibe Code, please create an account and link your X account at reactnativevibecode.com/settings ⚡'

// Check if we've already processed this tweet
async function hasProcessed(tweetId: string): Promise<boolean> {
  const existing = await db
    .select()
    .from(xBotReplies)
    .where(eq(xBotReplies.tweetId, tweetId))
    .limit(1)
  return existing.length > 0
}

// Record a tweet processing in the database
async function recordTweet(data: {
  tweetId: string
  replyTweetId?: string
  authorId?: string
  authorUsername?: string
  tweetText?: string
  status: string
  errorMessage?: string
  imageUrls?: string[]
  isAppRequest?: boolean
  appDescription?: string
  generationStatus?: string
  projectId?: string
  firstReplyTweetId?: string
  firstReplyContent?: string
  firstRepliedAt?: Date
}): Promise<void> {
  await db.insert(xBotReplies).values({
    tweetId: data.tweetId,
    replyTweetId: data.replyTweetId,
    authorId: data.authorId,
    authorUsername: data.authorUsername,
    tweetText: data.tweetText,
    status: data.status,
    errorMessage: data.errorMessage,
    imageUrls: data.imageUrls,
    isAppRequest: data.isAppRequest ?? false,
    appDescription: data.appDescription,
    generationStatus: data.generationStatus,
    projectId: data.projectId,
    firstReplyTweetId: data.firstReplyTweetId,
    firstReplyContent: data.firstReplyContent,
    firstRepliedAt: data.firstRepliedAt,
  })
}

// Update an existing tweet record
async function updateTweet(
  tweetId: string,
  data: Partial<{
    status: string
    generationStatus: string
    projectId: string
    errorMessage: string
    firstReplyTweetId: string
    firstReplyContent: string
    firstRepliedAt: Date
  }>
): Promise<void> {
  await db.update(xBotReplies).set(data).where(eq(xBotReplies.tweetId, tweetId))
}

// Get authenticated Twitter client
async function getAuthClient(): Promise<Client> {
  const refreshToken = process.env.TWITTER_REFRESH_TOKEN
  if (!refreshToken) {
    throw new Error('TWITTER_REFRESH_TOKEN environment variable is required')
  }

  const oauth2Client = new auth.OAuth2User({
    client_id: process.env.TWITTER_CLIENT_ID as string,
    client_secret: process.env.TWITTER_CLIENT_SECRET as string,
    callback: 'https://reactnativevibecode.com/api/x-bot/auth/callback',
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
  })

  oauth2Client.token = { refresh_token: refreshToken }
  await oauth2Client.refreshAccessToken()

  if (
    oauth2Client.token?.refresh_token &&
    oauth2Client.token.refresh_token !== refreshToken
  ) {
    console.log(
      'WARNING: Refresh token rotated. Update TWITTER_REFRESH_TOKEN:',
      oauth2Client.token.refresh_token
    )
  }

  return new Client(oauth2Client)
}

// Reply to tweet asking user to link account
async function replyWithLinkPrompt(
  client: Client,
  tweetId: string
): Promise<string | null> {
  try {
    const response = await client.tweets.createTweet({
      text: UNLINKED_USER_REPLY,
      reply: { in_reply_to_tweet_id: tweetId },
    })
    return response.data?.id || null
  } catch (error) {
    console.error(`[X-Bot] Failed to send link prompt reply:`, error)
    return null
  }
}

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
 * Core mention processing logic.
 * Takes normalized mention data and handles the full pipeline:
 * link check → classification → credit check → first reply → project creation → generation trigger
 */
async function processMention(
  mention: { tweetId: string; text: string; authorId: string; mediaUrls: string[] },
  client: Client,
  baseUrl: string
): Promise<{ action: string; projectId?: string; error?: string }> {
  const { tweetId, text, authorId, mediaUrls } = mention

  // Skip if already processed
  if (await hasProcessed(tweetId)) {
    console.log(`[X-Bot] Skipping tweet ${tweetId} - already processed`)
    return { action: 'already_processed' }
  }

  // Skip our own tweets
  if (authorId === YOUR_USER_ID) {
    console.log(`[X-Bot] Skipping tweet ${tweetId} - own tweet`)
    await recordTweet({
      tweetId,
      authorId,
      tweetText: text,
      status: 'skipped',
      errorMessage: 'Own tweet',
    })
    return { action: 'skipped_own_tweet' }
  }

  // Check if user has linked their Twitter account
  const linkedUser = await db
    .select()
    .from(twitterLinks)
    .where(eq(twitterLinks.twitterUserId, authorId))
    .limit(1)

  if (linkedUser.length === 0) {
    console.log(`[X-Bot] User ${authorId} not linked - sending prompt`)
    const replyId = await replyWithLinkPrompt(client, tweetId)
    await recordTweet({
      tweetId,
      replyTweetId: replyId || undefined,
      authorId,
      tweetText: text,
      status: replyId ? 'replied' : 'failed',
      errorMessage: 'User not linked',
      isAppRequest: false,
    })
    return { action: 'unlinked_user_prompt' }
  }

  const capsuleUserId = linkedUser[0].userId
  const authorUsername = linkedUser[0].twitterUsername
  console.log(`[X-Bot] Found linked user: ${capsuleUserId} (@${authorUsername})`)

  // Quick pre-filter before AI classification
  const mightBeAppRequest = quickAppRequestCheck(text)

  if (!mightBeAppRequest && mediaUrls.length === 0) {
    console.log(`[X-Bot] Tweet ${tweetId} doesn't look like app request, skipping`)
    await recordTweet({
      tweetId,
      authorId,
      authorUsername,
      tweetText: text,
      status: 'skipped',
      errorMessage: 'Not an app request (quick check)',
      isAppRequest: false,
    })
    return { action: 'skipped_not_app_request' }
  }

  // Classify with AI
  console.log(`[X-Bot] Classifying tweet ${tweetId} with AI...`)
  const classification = await classifyTweet(text, mediaUrls.length > 0, authorUsername)
  console.log(`[X-Bot] Classification result:`, classification)

  if (!classification.isAppRequest) {
    console.log(`[X-Bot] Tweet ${tweetId} is not an app request`)
    await recordTweet({
      tweetId,
      authorId,
      authorUsername,
      tweetText: text,
      status: 'skipped',
      errorMessage: classification.reasoning || 'Not an app request',
      isAppRequest: false,
    })
    return { action: 'skipped_not_app_request_ai' }
  }

  // Check subscription/credits before generation
  console.log(`[X-Bot] Checking credits for user ${capsuleUserId}...`)
  const creditCheck = await canUserSendMessage(capsuleUserId)

  if (!creditCheck.canSend) {
    console.log(`[X-Bot] User ${capsuleUserId} has no credits - sending upgrade prompt`)

    const upgradeText = creditCheck.usage.hasActiveSubscription
      ? `Hey @${authorUsername}! You've reached your monthly generation limit. Your quota resets on the 1st of next month. Visit reactnativevibecode.com/pricing for plan details.`
      : `Hey @${authorUsername}! You've used your free generation. Upgrade your plan at reactnativevibecode.com/pricing to build more apps from tweets.`

    let upgradeReplyId: string | null = null
    try {
      const response = await client.tweets.createTweet({
        text: upgradeText,
        reply: { in_reply_to_tweet_id: tweetId },
      })
      upgradeReplyId = response.data?.id || null
    } catch (error) {
      console.error(`[X-Bot] Failed to send upgrade reply:`, error)
    }

    await recordTweet({
      tweetId,
      replyTweetId: upgradeReplyId || undefined,
      authorId,
      authorUsername,
      tweetText: text,
      status: 'skipped',
      errorMessage: creditCheck.reason || 'No credits remaining',
      isAppRequest: true,
      appDescription: classification.appDescription,
    })

    return { action: 'no_credits' }
  }

  // App request with credits! Download images and start generation
  console.log(`[X-Bot] App request detected! Starting generation...`)

  let imageUrls: string[] = []
  if (mediaUrls.length > 0) {
    console.log(`[X-Bot] Downloading ${mediaUrls.length} images...`)
    imageUrls = await downloadAndStoreTweetImages(tweetId, mediaUrls)
    console.log(`[X-Bot] Stored ${imageUrls.length} images`)
  }

  // Increment message usage
  await incrementMessageUsage(capsuleUserId)

  // Send first reply — "Creating your app"
  const firstReplyText = `Hey @${authorUsername}! I'm gathering a plan and creating your app now. I'll reply with the link in the coming minutes.`
  let firstReplyTweetId: string | undefined
  try {
    const firstReplyResponse = await client.tweets.createTweet({
      text: firstReplyText,
      reply: { in_reply_to_tweet_id: tweetId },
    })
    firstReplyTweetId = firstReplyResponse.data?.id || undefined
    console.log(`[X-Bot] First reply sent: ${firstReplyTweetId}`)
  } catch (error) {
    console.error(`[X-Bot] Failed to send first reply (non-blocking):`, error)
  }

  // Record the tweet as pending with first reply info
  await recordTweet({
    tweetId,
    authorId,
    authorUsername,
    tweetText: text,
    status: 'pending',
    imageUrls,
    isAppRequest: true,
    appDescription: classification.appDescription,
    generationStatus: 'pending',
    firstReplyTweetId,
    firstReplyContent: firstReplyText,
    firstRepliedAt: firstReplyTweetId ? new Date() : undefined,
  })

  // Create project
  console.log(`[X-Bot] Creating project...`)
  const createProjectResponse = await fetch(
    `${baseUrl}/api/x-bot/create-project`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tweetId,
        userId: capsuleUserId,
        appDescription: classification.appDescription,
        imageUrls,
        secret: X_BOT_SECRET,
      }),
    }
  )

  if (!createProjectResponse.ok) {
    const error = await createProjectResponse.text()
    console.error(`[X-Bot] Failed to create project:`, error)
    await updateTweet(tweetId, {
      status: 'failed',
      generationStatus: 'failed',
      errorMessage: `Project creation failed: ${error}`,
    })
    return { action: 'project_creation_failed', error }
  }

  const projectData = await createProjectResponse.json()
  console.log(`[X-Bot] Project created: ${projectData.projectId}`)

  // Update record with project ID
  await updateTweet(tweetId, {
    projectId: projectData.projectId,
    generationStatus: 'generating',
  })

  // Trigger generation (fire and forget - it will call reply endpoint on completion)
  console.log(`[X-Bot] Triggering generation...`)
  fetch(`${baseUrl}/api/x-bot/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: projectData.projectId,
      userId: capsuleUserId,
      appDescription: classification.appDescription,
      imageUrls,
      tweetId,
      sandboxId: projectData.sandboxId,
      secret: X_BOT_SECRET,
    }),
  }).catch((err) => {
    console.error(`[X-Bot] Failed to trigger generation:`, err)
  })

  return { action: 'generation_started', projectId: projectData.projectId }
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
 * POST handler — Webhook Event Handler
 * X sends POST requests with mention events.
 * We validate the signature, extract mentions, and process each one.
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
      // Not a mention event — could be a follow, like, etc. Acknowledge silently.
      return NextResponse.json({ ok: true })
    }

    console.log(`[X-Bot] Webhook received ${tweetEvents.length} tweet events`)

    // Get base URL for internal API calls
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

      if (!tweetId || !authorId) {
        console.log('[X-Bot] Skipping event with missing tweet or author ID')
        continue
      }

      // Check if our bot is actually mentioned
      const mentions = tweet.entities?.user_mentions || []
      const isMentioned = mentions.some(
        (m: any) => m.id_str === YOUR_USER_ID
      )

      if (!isMentioned) {
        console.log(`[X-Bot] Skipping tweet ${tweetId} — bot not mentioned`)
        continue
      }

      console.log(`[X-Bot] Processing mention ${tweetId}: "${text.substring(0, 50)}..."`)

      // Extract media URLs from webhook v1.1 format
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
