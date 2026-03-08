# Email Admin System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an admin-only email management page at `/email-admin` with newsletter sending, send history tracking, and unsubscribe functionality.

**Architecture:** Add two new DB tables (`email_preferences`, `newsletter_sends`). Create admin page with session-based auth check against `ADMIN_EMAIL` env var. Add unsubscribe endpoint with HMAC token verification. Rename `newsletter.tsx` to `newsletter_1.tsx` and create a template registry.

**Tech Stack:** Next.js App Router, Drizzle ORM, Resend, React Email, HMAC-SHA256 for unsubscribe tokens

---

### Task 1: Database Schema — Add `email_preferences` and `newsletter_sends` tables

**Files:**
- Modify: `packages/database/src/schema.ts`

**Step 1: Add tables and relations**

Add after `privacyPolicies` table:

```typescript
// Email preferences for newsletter opt-in/out
export const emailPreferences = pgTable('email_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  subscribedToNewsletter: boolean('subscribed_to_newsletter').default(true).notNull(),
  unsubscribedAt: timestamp('unsubscribed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Newsletter send history
export const newsletterSends = pgTable('newsletter_sends', {
  id: uuid('id').primaryKey().defaultRandom(),
  templateName: text('template_name').notNull(), // e.g. "newsletter_1"
  subject: text('subject').notNull(),
  recipientCount: integer('recipient_count').notNull(),
  sentBy: text('sent_by')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  sentAt: timestamp('sent_at').defaultNow(),
})
```

Add relations and types. Add `emailPreferences: one(emailPreferences)` to userRelations.

**Step 2: Generate migration**

Run: `pnpm run db:generate`

**Step 3: Push schema**

Run: `pnpm run db:push`

**Step 4: Commit**

---

### Task 2: Rename newsletter template and create registry

**Files:**
- Rename: `apps/web/lib/email/templates/newsletter.tsx` → `apps/web/lib/email/templates/newsletter_1.tsx`
- Create: `apps/web/lib/email/templates/registry.ts`
- Modify: `apps/web/lib/email/index.ts`
- Modify: `apps/web/app/(app)/api/email-preview/route.ts`

**Step 1: Rename file and update component name**

Rename `newsletter.tsx` to `newsletter_1.tsx`. Keep the component as `NewsletterEmail` but also export metadata.

**Step 2: Create registry**

```typescript
// registry.ts
export interface NewsletterTemplate {
  name: string        // "newsletter_1"
  subject: string     // default subject line
  issueNumber: number
  issueDate: string
  component: React.ComponentType<any>
}

// Import all newsletter templates
import Newsletter1 from './newsletter_1'

export const newsletterTemplates: NewsletterTemplate[] = [
  {
    name: 'newsletter_1',
    subject: "What's New at React Native Vibe Code",
    issueNumber: 1,
    issueDate: 'March 2026',
    component: Newsletter1,
  },
]

export function getTemplate(name: string) {
  return newsletterTemplates.find(t => t.name === name)
}
```

**Step 3: Update `index.ts` imports**

Update `sendNewsletter` to accept a component directly or use registry.

**Step 4: Update email-preview route**

Update to use registry for newsletter templates.

**Step 5: Commit**

---

### Task 3: Unsubscribe token utility and endpoint

**Files:**
- Create: `apps/web/lib/email/unsubscribe.ts`
- Create: `apps/web/app/api/unsubscribe/route.ts`

**Step 1: Create HMAC token utility**

```typescript
// unsubscribe.ts
import crypto from 'node:crypto'

export function generateUnsubscribeToken(email: string): string {
  const secret = process.env.BETTER_AUTH_SECRET!
  return crypto.createHmac('sha256', secret).update(email).digest('hex')
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const expected = generateUnsubscribeToken(email)
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))
}

export function getUnsubscribeUrl(email: string): string {
  const token = generateUnsubscribeToken(email)
  const baseUrl = process.env.NEXT_PUBLIC_PROD_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://reactnativevibecode.com'
  return `${baseUrl}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`
}
```

**Step 2: Create unsubscribe API route**

GET endpoint that:
1. Validates email + token via HMAC
2. Looks up user by email
3. Upserts `email_preferences` record with `subscribedToNewsletter: false`
4. Returns simple HTML "You've been unsubscribed" page

**Step 3: Commit**

---

### Task 4: Add unsubscribe links to email templates

**Files:**
- Modify: `apps/web/lib/email/templates/newsletter_1.tsx`
- Modify: `apps/web/lib/email/templates/welcome.tsx`
- Modify: `apps/web/lib/email/index.ts`

**Step 1: Add `unsubscribeUrl` prop to newsletter template**

Add optional `unsubscribeUrl` prop. Add unsubscribe link to footer.

**Step 2: Add unsubscribe link to welcome email**

Same pattern — add optional `unsubscribeUrl` prop and link in footer.

**Step 3: Update `sendNewsletter` to generate per-recipient unsubscribe URLs**

Each email in the batch gets its own unsubscribe URL based on recipient email.

**Step 4: Update `sendWelcomeEmail` to include unsubscribe URL**

**Step 5: Commit**

---

### Task 5: Email Admin API routes

**Files:**
- Create: `apps/web/app/(app)/api/email-admin/history/route.ts`
- Create: `apps/web/app/(app)/api/email-admin/send/route.ts`

**Step 1: Create history endpoint**

GET — returns all `newsletter_sends` ordered by `sentAt` desc. Admin-only.

**Step 2: Create send endpoint**

POST — accepts `{ templateName: string }`. Queries all subscribed users, sends newsletter via `sendNewsletter`, records in `newsletter_sends`. Admin-only.

**Step 3: Commit**

---

### Task 6: Email Admin page UI

**Files:**
- Create: `apps/web/app/(app)/email-admin/page.tsx`

**Step 1: Create admin page**

Server component that:
1. Checks session against `ADMIN_EMAIL` env var (same pattern as ui-prompts)
2. Redirects to `/` if not admin
3. Renders client component `EmailAdminPanel`

**Step 2: Create EmailAdminPanel client component**

- Template list from registry (fetched or imported)
- Preview iframe for selected template
- Send button with confirmation dialog
- Send history table

**Step 3: Commit**

---
