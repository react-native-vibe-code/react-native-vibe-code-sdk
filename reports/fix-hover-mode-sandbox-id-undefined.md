# Fix: Hover Mode sandboxId Undefined in Sandbox

**Date**: 2026-02-28
**Severity**: Medium
**Status**: Fixed

---

## Problem

The visual editing (hover mode) feature was completely non-functional. When the user toggled hover/edit mode from the chat panel, the Expo app running inside the sandbox iframe never received the Pusher event because the Pusher channel subscription was skipped entirely.

### Symptom

User clicks the edit button in `chat-panel-input.tsx` → hover mode toggle API fires → Pusher event sent to `sandbox-{sandboxId}` channel → nothing happens in the sandbox. No element highlighting, no selection, no data sent back.

### Sandbox Logs (observed)

```
[useHoverWithChannel] Setting up Pusher listener, sandboxId: undefined
[useHoverWithChannel] Skipping Pusher setup - no window or sandboxId
[useHoverSystem] Initialized with: { enabled: false, sandboxId: undefined }
```

The `sandboxId` was always `undefined`, causing the Pusher setup guard (`if (!sandboxId) return`) to skip the entire hover system initialization.

---

## Root Cause

### Root Cause 1: Expo Router v6 Strips URL Query Parameters

The iframe URL correctly included `?sandboxId=xxx`:

```typescript
// preview-panel.tsx (line 244-247)
const actualPreviewUrl =
  basePreviewUrl && sandboxId
    ? `${basePreviewUrl}${basePreviewUrl.includes('?') ? '&' : '?'}sandboxId=${sandboxId}`
    : basePreviewUrl
```

And `server-utils.ts` (line 309) also appended it:

```typescript
const publicUrl = `https://${publicHost}?sandboxId=${sandbox.sandboxId}`
```

However, **Expo Router v6** calls `window.history.replaceState()` during initialization, which strips all query parameters from `window.location.search`. By the time the `useHoverWithChannel` hook runs, the search string is empty.

### Root Cause 2: Wrong Environment Variable Name

The hook's fallback used `process.env.SANDBOX_ID`:

```typescript
// useHoverWithChannel.ts (BEFORE fix)
const sandboxId =
  typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('sandboxId') ||
      process.env.SANDBOX_ID
    : process.env.SANDBOX_ID
```

Two problems:
1. `SANDBOX_ID` was **never set** anywhere (not in `.env.local`, not in the Dockerfile)
2. Expo only exposes `EXPO_PUBLIC_*` prefixed environment variables to client-side code. Even if `SANDBOX_ID` were set, it would be `undefined` in the browser bundle.

### Root Cause 3: Missing Environment Variable in Sandbox Setup

`server-utils.ts` already wrote `EXPO_PUBLIC_PROJECT_ID` to `.env.local` before starting the Metro dev server, but it did not write `EXPO_PUBLIC_SANDBOX_ID`. The sandbox ID was available as `sandbox.sandboxId` but was never persisted for the Expo app to read.

---

## Fix

### 1. Write EXPO_PUBLIC_SANDBOX_ID to .env.local

**File**: `packages/sandbox/src/lib/server-utils.ts`

Added `EXPO_PUBLIC_SANDBOX_ID` to the `.env.local` file that is written before the Metro dev server starts. This runs alongside the existing `EXPO_PUBLIC_PROJECT_ID` write:

```typescript
// AFTER fix
envVars.set('EXPO_PUBLIC_PROJECT_ID', projectId)

// Set EXPO_PUBLIC_SANDBOX_ID so the hover system can identify the sandbox
envVars.set('EXPO_PUBLIC_SANDBOX_ID', sandbox.sandboxId)
```

This runs inside the `if (projectId)` block, which is always entered (every call to `startExpoServer` provides a `projectId`). The `.env.local` is written before the Metro dev server starts (line 204), so Metro picks up the variable at startup.

### 2. Read from EXPO_PUBLIC_SANDBOX_ID

**File**: `packages/sandbox/local-expo-app/hooks/useHoverWithChannel.ts`

Changed the fallback from `process.env.SANDBOX_ID` to `process.env.EXPO_PUBLIC_SANDBOX_ID`:

```typescript
// AFTER fix
const sandboxId =
  typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('sandboxId') ||
      process.env.EXPO_PUBLIC_SANDBOX_ID
    : process.env.EXPO_PUBLIC_SANDBOX_ID
```

The URL query param is kept as the primary source (in case Expo Router behavior changes), but the reliable path is the `EXPO_PUBLIC_*` env var.

---

## Files Modified

| File | Changes |
|------|---------|
| `packages/sandbox/src/lib/server-utils.ts` | Write `EXPO_PUBLIC_SANDBOX_ID` to `.env.local` alongside `EXPO_PUBLIC_PROJECT_ID` |
| `packages/sandbox/local-expo-app/hooks/useHoverWithChannel.ts` | Read from `EXPO_PUBLIC_SANDBOX_ID` instead of `SANDBOX_ID` |

## Files Referenced (no changes needed)

| File | Role |
|------|------|
| `apps/web/components/preview-panel.tsx` | Constructs iframe URL with `?sandboxId=xxx` (correctly working) |
| `packages/sandbox/local-expo-app/features/element-edition/useHoverSystem.web.ts` | Mouse tracking and element selection (guards on `sandboxId`) |
| `packages/sandbox/local-expo-app/app/_layout.tsx` | Calls `useHoverWithChannel()` in `__DEV__` mode |
| `apps/web/app/(app)/api/hover-mode-toggle/route.ts` | Triggers Pusher event on `sandbox-{sandboxId}` channel |
| `apps/web/app/(app)/api/hover-selection/route.ts` | Receives element selection data from sandbox |
| `packages/sandbox/templates/expo-template/e2b.Dockerfile` | Copies `local-expo-app/` into container image |

---

## Deployment Note

The `server-utils.ts` change takes effect immediately (runs on the Next.js server). However, the `useHoverWithChannel.ts` change is baked into the sandbox Docker image at build time. **A template rebuild is required** for new sandboxes to include the fix:

```bash
pnpm run build:sandbox:expo-testing    # Testing template
pnpm run build:sandbox:expo            # Production template
```

Existing sandboxes will NOT have the fix until they are recreated from the updated template.

---

## Verification

1. **Template rebuild**: Run `pnpm run build:sandbox:expo-testing` to bake updated hook into image
2. **New sandbox**: Create a new project → verify sandbox logs show `sandboxId: <actual-id>` instead of `undefined`
3. **Pusher subscription**: Verify logs show `Successfully subscribed to Pusher channel: sandbox-<id>`
4. **Hover toggle**: Click edit button → verify sandbox receives `hover-mode-toggle` event
5. **Element selection**: In hover mode, click an element → verify selection data sent to `/api/hover-selection`
