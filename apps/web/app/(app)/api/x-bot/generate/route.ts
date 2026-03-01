import { NextRequest, NextResponse } from 'next/server'
import { Client, auth } from 'twitter-api-sdk'
import { db } from '@/lib/db'
import { xBotReplies, projects } from '@react-native-vibe-code/database'
import { eq } from 'drizzle-orm'
import { handleClaudeCodeGeneration } from '@/lib/claude-code-handler'
import { blobUrlsToBase64 } from '@/lib/x-bot/extract-images'

export const maxDuration = 300 // 5 minutes

// Secret key for x-bot internal calls
const X_BOT_SECRET = process.env.X_BOT_SECRET

/**
 * Get authenticated Twitter client for sending error replies
 */
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
  return new Client(oauth2Client)
}

/**
 * Send an error reply tweet when generation fails
 */
async function sendErrorReply(
  tweetId: string,
  authorUsername: string | null,
  firstReplyTweetId: string | null
): Promise<void> {
  try {
    const client = await getAuthClient()
    const username = authorUsername || 'there'
    const errorText = `Sorry @${username}, there was an issue creating your app. Please try again or visit reactnativevibecode.com to build it manually.`
    const replyToId = firstReplyTweetId || tweetId

    await client.tweets.createTweet({
      text: errorText,
      reply: { in_reply_to_tweet_id: replyToId },
    })
    console.log(`[X-Bot Generate] Error reply sent for tweet ${tweetId}`)
  } catch (replyError) {
    console.error(`[X-Bot Generate] Failed to send error reply:`, replyError)
  }
}

interface GenerateRequest {
  projectId: string
  userId: string
  appDescription: string
  imageUrls: string[]
  tweetId: string
  sandboxId: string
  secret: string
}

export async function POST(request: NextRequest) {
  const body: GenerateRequest = await request.json()
  const { projectId, userId, appDescription, imageUrls, tweetId, sandboxId, secret } = body

  // Validate internal secret
  if (secret !== X_BOT_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Validate required fields
  if (!projectId || !userId || !appDescription || !tweetId) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    )
  }

  console.log(`[X-Bot Generate] Starting generation for tweet ${tweetId}, project ${projectId}`)

  try {
    // Update xBotReplies status to generating
    await db
      .update(xBotReplies)
      .set({ generationStatus: 'generating' })
      .where(eq(xBotReplies.tweetId, tweetId))

    // Convert blob URLs to base64 for AI
    let images: string[] = []
    if (imageUrls && imageUrls.length > 0) {
      console.log(`[X-Bot Generate] Converting ${imageUrls.length} images to base64`)
      images = await blobUrlsToBase64(imageUrls)
    }

    // Build the prompt
    const prompt = buildPrompt(appDescription, images.length > 0)

    // Track generation result
    let generationSucceeded = false
    let generationError: string | null = null

    // Call the Claude Code handler
    await handleClaudeCodeGeneration(
      {
        projectId,
        userID: userId,
        userMessage: prompt,
        images,
        isFirstMessage: true,
        sandboxId,
        messageId: `xbot-${tweetId}`,
      },
      {
        onMessage: (message) => {
          // Log progress (we can't stream to Twitter, so just log)
          console.log(`[X-Bot Generate] Progress: ${message.substring(0, 100)}...`)
        },
        onComplete: async (result) => {
          console.log(`[X-Bot Generate] Generation complete for tweet ${tweetId}`)
          generationSucceeded = true

          // Update xBotReplies with completion
          await db
            .update(xBotReplies)
            .set({ generationStatus: 'completed' })
            .where(eq(xBotReplies.tweetId, tweetId))

          // Trigger reply endpoint (fire and forget)
          const replyUrl = new URL('/api/x-bot/reply', request.url)
          fetch(replyUrl.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tweetId,
              projectId,
              secret: X_BOT_SECRET,
            }),
          }).catch((err) => {
            console.error(`[X-Bot Generate] Failed to trigger reply:`, err)
          })
        },
        onError: async (error) => {
          console.error(`[X-Bot Generate] Error for tweet ${tweetId}:`, error)
          generationError = error
          generationSucceeded = false

          // Update xBotReplies with failure
          await db
            .update(xBotReplies)
            .set({
              status: 'failed',
              generationStatus: 'failed',
              errorMessage: error,
            })
            .where(eq(xBotReplies.tweetId, tweetId))

          // Send error reply tweet
          const record = await db
            .select()
            .from(xBotReplies)
            .where(eq(xBotReplies.tweetId, tweetId))
            .limit(1)

          await sendErrorReply(
            tweetId,
            record[0]?.authorUsername || null,
            record[0]?.firstReplyTweetId || null
          )
        },
      }
    )

    // Return status based on result
    if (generationSucceeded) {
      return NextResponse.json({ success: true, projectId })
    } else {
      return NextResponse.json(
        { success: false, error: generationError || 'Generation failed' },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('[X-Bot Generate] Unexpected error:', error)

    // Update status on error
    await db
      .update(xBotReplies)
      .set({
        status: 'failed',
        generationStatus: 'failed',
        errorMessage: error.message || 'Unexpected error',
      })
      .where(eq(xBotReplies.tweetId, tweetId))

    // Send error reply tweet
    const record = await db
      .select()
      .from(xBotReplies)
      .where(eq(xBotReplies.tweetId, tweetId))
      .limit(1)

    await sendErrorReply(
      tweetId,
      record[0]?.authorUsername || null,
      record[0]?.firstReplyTweetId || null
    )

    return NextResponse.json(
      { error: error.message || 'Generation failed' },
      { status: 500 }
    )
  }
}

/**
 * Build a prompt for app generation from tweet description
 */
function buildPrompt(appDescription: string, hasImages: boolean): string {
  let prompt = `Create a React Native Expo mobile app based on this request:\n\n${appDescription}\n\n`

  if (hasImages) {
    prompt += `I've attached reference images for the design. Please use them as inspiration for the UI layout and styling.\n\n`
  }

  prompt += `Requirements:
- Create a functional mobile app using React Native and Expo
- Use a clean, modern UI design
- Make sure the app runs without errors
- Focus on the core functionality described
- Use appropriate React Native components and styling

Please create all necessary files and ensure the app compiles and runs.`

  return prompt
}
