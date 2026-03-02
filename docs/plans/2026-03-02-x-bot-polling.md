# X-Bot Polling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Enterprise-only Account Activity API webhook with a Vercel Cron-based polling approach using the X API v2 mentions endpoint.

**Architecture:** A Vercel Cron job hits `GET /api/x-bot/poll` every 60 seconds. The handler fetches new mentions for @rnvibecode via `GET /users/:id/mentions?since_id=X`, then feeds each mention through the existing `processMention()` pipeline. State is tracked via the `xBotState` table (already in schema).

**Tech Stack:** Next.js API route, Vercel Cron, X API v2 (OAuth 2.0 User Context via `twitter-api-sdk`), Drizzle ORM, PostgreSQL.

---

## Task 1: Create the poll route handler

**Files:**
- Create: `apps/web/app/(app)/api/x-bot/poll/route.ts`

**Step 1: Create the poll route**

Create `apps/web/app/(app)/api/x-bot/poll/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { Client, auth } from 'twitter-api-sdk'
import { db } from '@/lib/db'
import { xBotState } from '@react-native-vibe-code/database'
import { eq } from 'drizzle-orm'
import { processMention } from '../route'

const YOUR_USER_ID = '1832518730582020097'

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
      '[X-Bot Poll] WARNING: Refresh token rotated. Update TWITTER_REFRESH_TOKEN:',
      oauth2Client.token.refresh_token
    )
  }

  return new Client(oauth2Client)
}

async function getLastTweetId(): Promise<string | null> {
  const rows = await db
    .select()
    .from(xBotState)
    .where(eq(xBotState.id, 'default'))
    .limit(1)
  return rows[0]?.lastTweetId || null
}

async function setLastTweetId(tweetId: string): Promise<void> {
  const existing = await db
    .select()
    .from(xBotState)
    .where(eq(xBotState.id, 'default'))
    .limit(1)

  if (existing.length === 0) {
    await db.insert(xBotState).values({
      id: 'default',
      lastTweetId: tweetId,
      updatedAt: new Date(),
    })
  } else {
    await db
      .update(xBotState)
      .set({ lastTweetId: tweetId, updatedAt: new Date() })
      .where(eq(xBotState.id, 'default'))
  }
}

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sends this header for cron jobs)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const client = await getAuthClient()
    const sinceId = await getLastTweetId()

    console.log(`[X-Bot Poll] Polling mentions since_id=${sinceId || 'none'}`)

    // Fetch mentions using X API v2
    const params: Record<string, string> = {
      'tweet.fields': 'author_id,created_at,text,attachments',
      'media.fields': 'url,type,media_key,preview_image_url',
      expansions: 'attachments.media_keys,author_id',
      'user.fields': 'id,username',
      max_results: '20',
    }
    if (sinceId) {
      params.since_id = sinceId
    }

    const mentionsResponse = await client.tweets.usersIdMentions(YOUR_USER_ID, params)

    const mentions = mentionsResponse.data || []

    if (mentions.length === 0) {
      console.log('[X-Bot Poll] No new mentions')
      return NextResponse.json({ ok: true, processed: 0 })
    }

    console.log(`[X-Bot Poll] Found ${mentions.length} new mentions`)

    const mediaIncludes = mentionsResponse.includes?.media || []
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://reactnativevibecode.com'

    const results: Array<{ tweetId: string; action: string }> = []

    // Process mentions oldest-first so we can update sinceId progressively
    const sortedMentions = [...mentions].reverse()

    for (const tweet of sortedMentions) {
      const tweetId = tweet.id
      const text = tweet.text || ''
      const authorId = tweet.author_id || ''

      if (!tweetId || !authorId) continue

      // Extract media URLs from v2 format
      const mediaKeys = tweet.attachments?.media_keys || []
      const mediaUrls: string[] = []
      for (const key of mediaKeys) {
        const media = mediaIncludes.find((m: any) => m.media_key === key)
        if (media && media.type === 'photo' && media.url) {
          mediaUrls.push(media.url)
        }
      }

      console.log(`[X-Bot Poll] Processing mention ${tweetId}: "${text.substring(0, 50)}..."`)

      const result = await processMention(
        { tweetId, text, authorId, mediaUrls },
        client,
        baseUrl
      )

      results.push({ tweetId, action: result.action })

      // Update sinceId after each successful processing
      await setLastTweetId(tweetId)
    }

    return NextResponse.json({ ok: true, processed: results.length, results })
  } catch (error: any) {
    console.error('[X-Bot Poll] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Poll failed' },
      { status: 500 }
    )
  }
}
```

**Step 2: Run type-check**

Run: `pnpm run type-check`
Expected: No errors related to poll route (may need to export processMention — see Task 2)

**Step 3: Commit**

```bash
git add apps/web/app/(app)/api/x-bot/poll/route.ts
git commit -m "feat(x-bot): add polling route for mentions via Vercel Cron"
```

---

## Task 2: Export `processMention` and `getAuthClient` from the main route

The existing `processMention()` and `getAuthClient()` in `apps/web/app/(app)/api/x-bot/route.ts` are not exported. The poll route needs to call them.

**Files:**
- Modify: `apps/web/app/(app)/api/x-bot/route.ts`
- Modify: `apps/web/app/(app)/api/x-bot/poll/route.ts` (update import)

**Step 1: Extract shared functions to a shared module**

Create `apps/web/lib/x-bot/process-mention.ts` by moving `processMention`, `getAuthClient`, `hasProcessed`, `recordTweet`, `updateTweet`, `replyWithLinkPrompt`, and related constants out of `route.ts` into this shared file. Export `processMention` and `getAuthClient`.

Key exports:
- `processMention(mention, client, baseUrl)` — the full pipeline
- `getAuthClient()` — OAuth 2.0 client

Then update both `route.ts` (webhook handler) and `poll/route.ts` to import from `@/lib/x-bot/process-mention`.

**Step 2: Update poll route to import from shared module**

In `apps/web/app/(app)/api/x-bot/poll/route.ts`, replace the local `getAuthClient` with import from `@/lib/x-bot/process-mention` and remove the duplicate.

**Step 3: Run type-check**

Run: `pnpm run type-check`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/lib/x-bot/process-mention.ts apps/web/app/(app)/api/x-bot/route.ts apps/web/app/(app)/api/x-bot/poll/route.ts
git commit -m "refactor(x-bot): extract processMention and getAuthClient to shared module"
```

---

## Task 3: Add Vercel Cron configuration

**Files:**
- Modify: `vercel.json`

**Step 1: Add crons config**

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/x-bot/poll",
      "schedule": "* * * * *"
    }
  ]
}
```

This runs the poll endpoint every minute. Vercel automatically sends the `CRON_SECRET` as a Bearer token in the Authorization header.

**Step 2: Add CRON_SECRET env var to Vercel**

Tell the user to add `CRON_SECRET` to Vercel env vars (any random string). Vercel uses this to authenticate cron requests.

**Step 3: Commit**

```bash
git add vercel.json
git commit -m "feat(x-bot): add Vercel Cron config for 1-minute polling"
```

---

## Task 4: Seed the initial `lastTweetId`

Without an initial `lastTweetId`, the first poll would fetch the most recent 20 mentions (potentially old ones). We need to seed it with the ID of the most recent mention to avoid reprocessing.

**Files:**
- No new files — manual step

**Step 1: After deploying, call the mentions API once to get the latest tweet ID**

Or manually insert into the `xBotState` table:

```sql
INSERT INTO x_bot_state (id, last_tweet_id, updated_at)
VALUES ('default', '<latest-mention-tweet-id>', NOW())
ON CONFLICT (id) DO UPDATE SET last_tweet_id = '<latest-mention-tweet-id>', updated_at = NOW();
```

Alternatively, the poll handler already handles the "no sinceId" case — it will fetch the latest 20, process them, and then track from there. If we're OK potentially reprocessing a few old mentions (they'll be skipped via `hasProcessed` dedup), we can skip this step.

---

## Task 5: Clean up webhook-specific code (optional)

**Files:**
- Modify: `apps/web/app/(app)/api/x-bot/route.ts`
- Optionally remove: `apps/web/lib/x-bot/webhook-client.ts`
- Optionally remove: `apps/web/scripts/register-x-webhook.ts`

**Step 1: Simplify the main route**

Keep the `GET` handler for CRC (harmless, and keeps the webhook registered in case we want it later). Remove or comment out the `POST` webhook handler, since it will never be called.

Alternatively, keep everything as-is — the POST handler won't hurt anything if it's never called.

**Step 2: Commit (if any changes)**

```bash
git commit -m "chore(x-bot): remove unused webhook POST handler"
```

---

## Deployment Checklist

1. Add `CRON_SECRET` env var to Vercel (generate a random string)
2. Deploy
3. Verify cron is running in Vercel Dashboard → Settings → Cron Jobs
4. Post a tweet mentioning @rnvibecode
5. Wait up to 60 seconds
6. Check Vercel function logs for `[X-Bot Poll]` entries
7. Verify the bot replies
