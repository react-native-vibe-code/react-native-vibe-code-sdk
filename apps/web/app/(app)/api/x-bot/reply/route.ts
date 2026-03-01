import { NextRequest, NextResponse } from 'next/server'
import { Client, auth } from 'twitter-api-sdk'
import { db } from '@/lib/db'
import { xBotReplies, projects } from '@react-native-vibe-code/database'
import { eq } from 'drizzle-orm'

// Secret key for x-bot internal calls
const X_BOT_SECRET = process.env.X_BOT_SECRET

interface ReplyRequest {
  tweetId: string
  projectId: string
  secret: string
}

/**
 * Get authenticated Twitter client using env var refresh token
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

  oauth2Client.token = {
    refresh_token: refreshToken,
  }

  await oauth2Client.refreshAccessToken()

  if (
    oauth2Client.token?.refresh_token &&
    oauth2Client.token.refresh_token !== refreshToken
  ) {
    console.log(
      'WARNING: Refresh token was rotated. Update TWITTER_REFRESH_TOKEN env var with:',
      oauth2Client.token.refresh_token
    )
  }

  return new Client(oauth2Client)
}

/**
 * Build the final reply text within Twitter's 280 character limit.
 * Includes app title, brief description, edit link, and remix link.
 */
function buildReplyText(
  title: string,
  appDescription: string | null,
  projectId: string
): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || 'https://reactnativevibecode.com'
  const editUrl = `${baseUrl}/p/${projectId}`
  const remixUrl = `${baseUrl}/p/${projectId}/remix`

  const links = `\nEdit your app: ${editUrl}\nRemix it: ${remixUrl}`
  const header = `Your app "${title}" is ready!`

  // Calculate remaining space for description
  // 280 char limit, account for header + links + newlines
  const fixedLength = header.length + links.length + 2 // 2 for newlines between sections
  const maxDescLength = 280 - fixedLength

  if (!appDescription || maxDescLength <= 0) {
    const text = `${header}${links}`
    return text.length <= 280 ? text : text.substring(0, 280)
  }

  const desc =
    appDescription.length > maxDescLength
      ? appDescription.substring(0, maxDescLength - 3) + '...'
      : appDescription

  const text = `${header}\n\n${desc}${links}`
  return text.length <= 280 ? text : `${header}${links}`
}

export async function POST(request: NextRequest) {
  try {
    const body: ReplyRequest = await request.json()
    const { tweetId, projectId, secret } = body

    // Validate internal secret
    if (secret !== X_BOT_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!tweetId || !projectId) {
      return NextResponse.json(
        { error: 'Missing required fields: tweetId, projectId' },
        { status: 400 }
      )
    }

    console.log(
      `[X-Bot Reply] Sending final reply for tweet ${tweetId}, project ${projectId}`
    )

    // Get project details
    const projectResults = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    if (projectResults.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const project = projectResults[0]

    // Get xBotReplies record to find firstReplyTweetId and appDescription
    const replyRecord = await db
      .select()
      .from(xBotReplies)
      .where(eq(xBotReplies.tweetId, tweetId))
      .limit(1)

    // Determine which tweet to reply to for proper threading
    // Reply to the first reply tweet to create a thread, fallback to original tweet
    const replyToTweetId = replyRecord[0]?.firstReplyTweetId || tweetId

    // Build reply text with app details
    const appDescription = replyRecord[0]?.appDescription || null
    const replyText = buildReplyText(
      project.title || 'Untitled App',
      appDescription,
      projectId
    )

    // Send reply via Twitter API
    const client = await getAuthClient()
    const response = await client.tweets.createTweet({
      text: replyText,
      reply: { in_reply_to_tweet_id: replyToTweetId },
    })

    console.log(`[X-Bot Reply] Response:`, JSON.stringify(response))

    if (response.data?.id) {
      // Update xBotReplies with final reply info
      await db
        .update(xBotReplies)
        .set({
          status: 'replied',
          replyTweetId: response.data.id,
          replyContent: replyText,
          repliedAt: new Date(),
        })
        .where(eq(xBotReplies.tweetId, tweetId))

      console.log(`[X-Bot Reply] Successfully replied to tweet ${tweetId}`)

      return NextResponse.json({
        success: true,
        replyId: response.data.id,
        replyText,
      })
    } else {
      console.error(
        `[X-Bot Reply] No reply ID returned for tweet ${tweetId}`
      )

      await db
        .update(xBotReplies)
        .set({
          status: 'failed',
          errorMessage: 'No reply ID returned from Twitter',
        })
        .where(eq(xBotReplies.tweetId, tweetId))

      return NextResponse.json(
        { error: 'Failed to send reply - no ID returned' },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('[X-Bot Reply] Error:', error)

    return NextResponse.json(
      { error: error.message || 'Failed to send reply' },
      { status: 500 }
    )
  }
}
