# PRD: X-Bot (@rnvibecode) — Twitter Bot That Creates React Native Apps from Tweets

## Introduction

The x-bot feature allows users to tag `@rnvibecode` on Twitter/X to create React Native apps from tweet content (text + images). The bot classifies the tweet, creates a project programmatically, generates the app via Claude Code, and replies with links to view, edit, and remix the app. The feature is partially implemented — this PRD covers completing it end-to-end.

## Goals

- Rename all `@capsulethis` / `capsulethis.com` references to `@rnvibecode` / `rnvibecode.com`
- Switch from manual polling to webhook-based event handling using the X API
- Implement two-tweet reply flow: (1) "Creating your app..." immediately, (2) final result with links after generation
- Add subscription/credit verification — only paid users with credits can trigger generation
- Free/unlinked users get appropriate reply tweets directing them to sign up or link
- Reliably detect generation completion and handle failures gracefully

## User Stories

### US-001: Rename all capsulethis references to rnvibecode
**Description:** As a developer, I need all brand references in x-bot files updated so the bot operates under the correct handle and domain.

**Acceptance Criteria:**
- [ ] No occurrence of "capsulethis" remains in `apps/web/app/(app)/api/x-bot/` files
- [ ] `NEXT_PUBLIC_APP_URL` fallback changed to `rnvibecode.com`
- [ ] OAuth callback URLs use `rnvibecode.com`
- [ ] `UNLINKED_USER_REPLY` message references `rnvibecode.com/settings`
- [ ] Typecheck passes

### US-002: Add schema fields for two-tweet reply tracking
**Description:** As a developer, I need the `xBotReplies` table to track both the initial "creating your app" reply and the final "app is ready" reply.

**New columns on `xBotReplies`:**
- `firstReplyTweetId` (text, nullable)
- `firstReplyContent` (text, nullable)
- `firstRepliedAt` (timestamp, nullable)
- `authorUsername` (text, nullable)

**Acceptance Criteria:**
- [ ] New columns added to `xBotReplies` schema in `packages/database/src/schema.ts`
- [ ] Migration generated with `pnpm run db:generate`
- [ ] Migration applies cleanly with `pnpm run db:push`
- [ ] Typecheck passes

### US-003: Add subscription/credit check before generation
**Description:** As a paid user, I want my app created when I tag the bot. As a free user, I want to be told to upgrade.

**Acceptance Criteria:**
- [ ] Free users who mention the bot get a reply directing them to upgrade at `rnvibecode.com/pricing`
- [ ] Paid users with remaining credits proceed to generation
- [ ] Message usage is incremented via `incrementMessageUsage()` when generation starts
- [ ] Paid users who've exhausted their monthly limit get a "limit reached" reply
- [ ] Reuses `canUserSendMessage` from `packages/payments/src/lib/message-usage.ts`
- [ ] Typecheck passes

### US-004: Implement first reply — "Creating your app"
**Description:** As a user who tagged the bot, I want immediate feedback that my request was received.

**First reply text:** `Hey @{username}! I'm gathering a plan and creating your app now. I'll reply with the link in the coming minutes.`

**Acceptance Criteria:**
- [ ] First reply sent immediately after tweet is classified as an app request and credits verified
- [ ] First reply includes the user's @handle
- [ ] `firstReplyTweetId` stored in the database
- [ ] First reply is sent as reply to original tweet (`in_reply_to_tweet_id`)
- [ ] If first reply fails to send, generation still proceeds (non-blocking)
- [ ] Typecheck passes

### US-005: Implement second reply — "App is ready" with links
**Description:** As a user, after my app is built, I want a reply with the project edit link and remix link.

**Second reply text (threaded under first reply):**
```
Your app "{title}" is ready!

{brief_description}

Edit: rnvibecode.com/p/{projectId}
Remix: rnvibecode.com/p/{projectId}/remix
```

**Acceptance Criteria:**
- [ ] Final reply includes app title, description, edit link, and remix link
- [ ] Reply is threaded under first reply (or original tweet as fallback)
- [ ] Reply fits within 280 characters (truncate description if needed)
- [ ] Database record updated with final reply details and `status = 'replied'`
- [ ] Typecheck passes

### US-006: Handle generation failure in reply flow
**Description:** As a user, if my app generation fails, I should be notified via reply.

**Error reply text:** `Sorry @{username}, there was an issue creating your app. Please try again or visit rnvibecode.com to build it manually.`

**Acceptance Criteria:**
- [ ] Failed generations trigger an error reply tweet
- [ ] Error reply is threaded under the first reply
- [ ] Database record reflects the failure with `status: 'failed'`
- [ ] Typecheck passes

### US-007: Switch from polling to webhook-based event handling
**Description:** As a developer, I want the bot to receive mention events via webhooks for real-time response.

**Route changes:**
- `GET /api/x-bot` → CRC challenge handler (returns HMAC-SHA256 of `crc_token`)
- `POST /api/x-bot` → Webhook event handler (validates signature, processes mention events)

**New file:** `apps/web/lib/x-bot/webhook-client.ts` — signature validation, CRC helpers

**New env vars:** `TWITTER_WEBHOOK_SECRET`, `TWITTER_BEARER_TOKEN`

**Acceptance Criteria:**
- [ ] GET `/api/x-bot` returns valid CRC response for challenge requests
- [ ] POST `/api/x-bot` validates webhook signature before processing
- [ ] Mention events are extracted and processed correctly
- [ ] Invalid/tampered webhooks rejected with 401
- [ ] Existing mention processing logic preserved (classify, check user, credits, create, generate)
- [ ] First reply sent from webhook handler after validation
- [ ] Typecheck passes
- [ ] Verify changes work in browser (test CRC endpoint manually)

### US-008: Create webhook registration script
**Description:** As a developer, I need a one-time script to register the webhook URL with X and subscribe to account activity events.

**New file:** `apps/web/scripts/register-x-webhook.ts`

**Acceptance Criteria:**
- [ ] Script registers webhook at `https://rnvibecode.com/api/x-bot`
- [ ] Script creates account activity subscription
- [ ] Script handles errors (already registered, invalid URL)
- [ ] Runnable via `pnpm run x-bot:register-webhook`
- [ ] Typecheck passes

## Non-Goals

- Multi-bot support — only `@rnvibecode` for now
- Thread following — no conversation follow-ups, only responds to initial mention
- Auto-matching Twitter to platform users — manual linking required
- Rate limiting per Twitter user — relies on platform subscription limits
- Webhook retry queue — failures are logged, not queued
- Full brand rename across all 41 files — only x-bot files in scope

## Technical Considerations

- **Existing functions to reuse:** `canUserSendMessage()`, `incrementMessageUsage()`, `getAuthClient()`, `classifyTweet()`, `quickAppRequestCheck()`, `extractMediaUrls()`, `downloadAndStoreTweetImages()`, `handleClaudeCodeGeneration()`, `generateTitleFromUserMessage()`
- **Tweet limit:** 280 characters — truncate descriptions in final reply
- **Reply threading:** `in_reply_to_tweet_id` points to first reply for proper thread
- **Webhook CRC:** Must respond within 3 seconds
- **Current SDK:** `twitter-api-sdk@^1.2.1` — keep for OAuth2 reply sending
- **Generation max duration:** 5 minutes (`maxDuration = 300`)
- **Fire-and-forget pattern:** Webhook handler sends first reply, fires generation endpoint, returns 200 quickly
