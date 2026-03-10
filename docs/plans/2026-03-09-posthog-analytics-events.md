# PostHog Analytics Events Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate PostHog initialization to `instrumentation-client.ts` (Next.js 15.3+ approach) and add analytics events for all key user flows.

**Architecture:** Use `instrumentation-client.ts` for lightweight PostHog init, keep `PostHogProvider` in `providers.tsx` for React context. In client components, import `posthog` directly from `posthog-js` (no hook needed). Events are added at the action site (onClick handlers / form submits), not in effects.

**Tech Stack:** posthog-js (already installed), Next.js 15.3+ instrumentation API

---

## Event Inventory

| Event | Properties | File |
|-------|-----------|------|
| `project_created` | `template`, `model`, `has_images` | `home-client.tsx` |
| `message_sent` | `has_images`, `has_skills`, `has_selection` | `chat-panel-input.tsx` |
| `subscription_modal_opened` | `source` | `nav-header.tsx` |
| `plan_selected` | `plan_name`, `plan_price` | `subscription-modal.tsx` |
| `sidebar_section_clicked` | `section` (`chat`, `assets`, `cloud`, `backend`, `projects`) | `app-sidebar.tsx` |
| `cloud_enabled` | `project_id` | `cloud-sidebar-panel.tsx` |
| `download_clicked` | `project_id` | `project-header-actions.tsx` |
| `remix_clicked` | `project_id` | `project-header-actions.tsx` |
| `publish_to_web_clicked` | `project_id`, `is_update` | `project-header-actions.tsx` |
| `app_store_clicked` | `project_id` | `project-header-actions.tsx` |
| `nav_subscription_modal_opened` | — | `nav-header.tsx` (both locations) |

---

### Task 1: Create `instrumentation-client.ts`

**Files:**
- Create: `apps/web/instrumentation-client.ts`

The Next.js 15.3+ approach runs this file once on the client before the app mounts — ideal for analytics initialization.

**Step 1: Create the file**

```ts
// apps/web/instrumentation-client.ts
import posthog from 'posthog-js'

if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    defaults: '2026-01-30',
    person_profiles: 'identified_only',
    session_recording: {
      recordCrossOriginIframes: true,
    },
  })
}
```

**Step 2: Remove init from `providers.tsx`**

In `apps/web/app/(app)/providers.tsx`, remove lines 16-24:
```ts
// DELETE THIS BLOCK:
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_ENABLE_POSTHOG && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    person_profiles: 'identified_only',
    session_recording: {
      recordCrossOriginIframes: true,
    }
  })
}
```

Also remove the conditional wrapper in `PostHogProvider` — always render `PostHogProviderJS`:
```tsx
// BEFORE:
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return process.env.NEXT_PUBLIC_ENABLE_POSTHOG ? (
    <PostHogProviderJS client={posthog}>{children}</PostHogProviderJS>
  ) : (
    children
  )
}

// AFTER:
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return <PostHogProviderJS client={posthog}>{children}</PostHogProviderJS>
}
```

**Step 3: Verify the app still loads**

Run: `pnpm dev:3210` and open http://localhost:3210 — no console errors.

**Step 4: Commit**

```bash
git add apps/web/instrumentation-client.ts apps/web/app/(app)/providers.tsx
git commit -m "feat(analytics): migrate PostHog init to instrumentation-client.ts"
```

---

### Task 2: Track `project_created` in home-client.tsx

**Files:**
- Modify: `apps/web/components/home-client.tsx`

The `handleSubmitAuth` function (around line 119) creates a project and then calls `router.push`. Currently `chat_submit` fires there. Add `project_created` right after `router.push`.

**Step 1: Find the exact location**

In `home-client.tsx`, find the block that calls `router.push('/p/${projectId}...')` then `posthog.capture('chat_submit', ...)`.

**Step 2: Add the event after `chat_submit`**

```ts
posthog.capture('chat_submit', {
  template: selectedTemplate,
  model: languageModel.model,
  hasImages: files.length > 0,
  // ...existing props
})

// ADD AFTER:
posthog.capture('project_created', {
  template: selectedTemplate,
  model: languageModel.model,
  has_images: files.length > 0,
})
```

**Step 3: Commit**

```bash
git add apps/web/components/home-client.tsx
git commit -m "feat(analytics): track project_created event"
```

---

### Task 3: Track `message_sent` in chat-panel-input.tsx

**Files:**
- Modify: `apps/web/components/chat-panel-input.tsx`

The `enhancedHandleSubmit` function (around line 477) is where the user sends a message in the project editor. Add tracking at the top of this function (before the guard/early returns).

**Step 1: Add posthog import**

At the top of `chat-panel-input.tsx`, add:
```ts
import posthog from 'posthog-js'
```

**Step 2: Add event at the start of `enhancedHandleSubmit`**

```ts
const enhancedHandleSubmit = (e: React.FormEvent) => {
  // ADD AT TOP:
  posthog.capture('message_sent', {
    has_images: imageAttachments.length > 0,
    has_skills: selectedSkills.length > 0,
    has_selection: !!latestSelection,
  })

  // Stop recording if currently recording
  if (isRecording) {
    ...
```

**Step 3: Commit**

```bash
git add apps/web/components/chat-panel-input.tsx
git commit -m "feat(analytics): track message_sent event in project editor"
```

---

### Task 4: Track sidebar section clicks in app-sidebar.tsx

**Files:**
- Modify: `apps/web/components/app-sidebar.tsx`

The `SidebarNav` component receives `onPanelChange` and calls it on button clicks. Wrap the call with a posthog event.

**Step 1: Add posthog import**

```ts
import posthog from 'posthog-js'
```

**Step 2: Add tracking inside `SidebarNav` onClick handlers**

The Chat button (around line 129):
```tsx
onClick={() => {
  posthog.capture('sidebar_section_clicked', { section: 'chat' })
  onPanelChange(null)
}}
```

The menuItems map (around line 144):
```tsx
onClick={() => {
  posthog.capture('sidebar_section_clicked', { section: item.id })
  onPanelChange(activePanel === item.id ? null : item.id)
}}
```

**Step 3: Commit**

```bash
git add apps/web/components/app-sidebar.tsx
git commit -m "feat(analytics): track sidebar section clicks"
```

---

### Task 5: Track `cloud_enabled` in cloud-sidebar-panel.tsx

**Files:**
- Modify: `apps/web/components/cloud-sidebar-panel.tsx`

The `handleEnableCloud` function (line 36) calls the enable API. Add tracking after successful response.

**Step 1: Add posthog import**

```ts
import posthog from 'posthog-js'
```

**Step 2: Add event after `toast.success`**

```ts
toast.success('Cloud enabled successfully! Your database is now ready.')
posthog.capture('cloud_enabled', { project_id: projectId })
onCloudEnabled?.()
```

**Step 3: Commit**

```bash
git add apps/web/components/cloud-sidebar-panel.tsx
git commit -m "feat(analytics): track cloud_enabled event"
```

---

### Task 6: Track publish/download/remix in project-header-actions.tsx

**Files:**
- Modify: `apps/web/components/project-header-actions.tsx`

**Step 1: Add posthog import**

```ts
import posthog from 'posthog-js'
```

**Step 2: Track `download_clicked` — add at top of `handleDownload` (around line 380)**

```ts
const handleDownload = async () => {
  posthog.capture('download_clicked', { project_id: projectId })
  if (!projectId || !session?.user?.id) {
```

**Step 3: Track `publish_to_web_clicked` — add at top of `handleDeploy` (around line 274)**

```ts
const handleDeploy = async () => {
  const isUpdate = !!(currentProject?.cloudflareProjectName || currentProject?.deployedUrl)
  posthog.capture('publish_to_web_clicked', {
    project_id: projectId,
    is_update: isUpdate,
  })
  if (!projectId) {
```

Note: `isUpdate` is already computed later in the function; compute it before the early returns to pass to both posthog and the existing logic.

**Step 4: Track `remix_clicked` — find the remix copy button (around line 617 where GitFork is used)**

Find the onClick for the remix button and add:
```ts
onClick={() => {
  posthog.capture('remix_clicked', { project_id: projectId })
  // existing copy logic
}}
```

**Step 5: Track `app_store_clicked` — the App Store button uses `onOpenAppStoreSubmissions` (line 575)**

Wrap the onClick:
```tsx
onClick={() => {
  posthog.capture('app_store_clicked', { project_id: projectId })
  onOpenAppStoreSubmissions?.()
}}
```

(Remove the `disabled={!onOpenAppStoreSubmissions}` prop accordingly, or keep it — just ensure the onClick wrapper calls both.)

**Step 6: Commit**

```bash
git add apps/web/components/project-header-actions.tsx
git commit -m "feat(analytics): track download, remix, publish-to-web, app-store clicks"
```

---

### Task 7: Track subscription modal open + plan selection

**Files:**
- Modify: `apps/web/components/nav-header.tsx`
- Modify: `apps/web/components/subscription-modal.tsx`

#### nav-header.tsx — Track subscription modal open

There are two places that call `setIsSubscriptionModalOpen(true)`: around lines 836 and 1106.

**Step 1: Add posthog import to nav-header.tsx**

```ts
import posthog from 'posthog-js'
```

**Step 2: Create a helper to open the modal with tracking**

In the component body, add:
```ts
const openSubscriptionModal = (source: string) => {
  posthog.capture('subscription_modal_opened', { source })
  setIsSubscriptionModalOpen(true)
}
```

**Step 3: Replace both `setIsSubscriptionModalOpen(true)` calls**

Line ~836:
```ts
// BEFORE:
setIsSubscriptionModalOpen(true)
// AFTER:
openSubscriptionModal('user_menu')
```

Line ~1106:
```ts
// BEFORE:
setIsSubscriptionModalOpen(true)
// AFTER:
openSubscriptionModal('user_menu_mobile')
```

#### subscription-modal.tsx — Track plan selection

**Step 4: Add posthog import to subscription-modal.tsx**

```ts
import posthog from 'posthog-js'
```

**Step 5: Add event at top of `handleSubscribe` (line 107)**

```ts
const handleSubscribe = async (plan: Plan) => {
  posthog.capture('plan_selected', {
    plan_name: plan.name,
    plan_price: plan.price,
  })
  if (!plan.productId) {
```

**Step 6: Commit**

```bash
git add apps/web/components/nav-header.tsx apps/web/components/subscription-modal.tsx
git commit -m "feat(analytics): track subscription modal open and plan selection"
```

---

### Task 8: Verify all events in PostHog dashboard

**Step 1: Enable PostHog in your `.env.local`**

Ensure `NEXT_PUBLIC_ENABLE_POSTHOG=true` is set. (The new `instrumentation-client.ts` only checks `NEXT_PUBLIC_POSTHOG_KEY`, which should already be set.)

**Step 2: Run dev server and trigger each event**

- Create a new project → check `project_created` in PostHog Live Events
- Send a message in project editor → check `message_sent`
- Open subscription modal → check `subscription_modal_opened`
- Click a plan → check `plan_selected`
- Click sidebar sections → check `sidebar_section_clicked`
- Click Enable Cloud → check `cloud_enabled`
- Click Download → check `download_clicked`
- Click Remix → check `remix_clicked`
- Click Publish to Web → check `publish_to_web_clicked`
- Click App Store → check `app_store_clicked`

**Step 3: Confirm all events appear with correct properties**
