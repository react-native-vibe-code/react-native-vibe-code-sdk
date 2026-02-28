# Fix: Streaming Message Loss on Sandbox Termination

**Date**: 2026-02-28
**Severity**: Critical
**Status**: Fixed

---

## Problem

When the E2B sandbox's gRPC process stream closed mid-generation (producing a `[unknown] terminated` or `context canceled` error), two cascading failures occurred:

1. **The stream was killed prematurely** even though the Claude agent had already delivered most or all of its content.
2. **Messages were never saved to the database**, causing the UI to show a previous conversation's history instead of the current one on re-render.

### Symptom

User asks "create a todo list app" -> agent starts streaming content -> E2B process stream drops -> UI goes blank or shows a stale previous conversation. The spinning cog loader disappears. No error message is shown to the user.

### E2B Sandbox Logs (observed)

```
[14:48:56] ERROR  context canceled  Process start (server stream end)  operation_id: 41
[14:49:12] INFO   Process with pid 1034 started   (sandbox keeps running normally)
[14:49:18] INFO   LISTENING                        (port 8081 still active)
```

The sandbox itself remained alive and healthy. The error was only about the gRPC stream for the specific spawned process, not about the sandbox terminating.

---

## Root Causes

### Root Cause 1: Fire-and-Forget Async Callbacks

The streaming callback chain (`onComplete`/`onError`) was never awaited at any level.

**Call chain**:
```
route.ts
  await handleClaudeCodeGeneration(...)        // awaits the handler
    claude-code-handler.ts
      await generateAppStreaming(...)           // awaits the service
        claude-code-service.ts
          callbacks.onComplete(response)        // NOT AWAITED - fire & forget
          return                                // returns immediately
```

The `StreamingCallbacks` interface declared sync signatures:

```typescript
// claude-code-service.ts (BEFORE fix)
export interface StreamingCallbacks {
  onMessage: (message: string) => void
  onComplete: (result: AppGenerationResponse) => void   // sync
  onError: (error: string) => void                      // sync
}
```

But the actual callbacks passed from `route.ts` and `claude-code-handler.ts` were `async` functions performing database writes, usage tracking, and stream closure. Since they were never awaited, the function returned before the callbacks finished executing.

**Timeline of the race condition**:
```
T+0ms    Service calls: callbacks.onComplete(response)  [NOT AWAITED]
T+0ms    Service returns from generateAppStreaming()
T+1ms    Handler returns from handleClaudeCodeGeneration()
T+2ms    route.ts: await resolves, start() function ends
T+3ms    ReadableStream has no more work -> stream closes

T+100ms  onComplete callback is STILL RUNNING
         - saveMessagesToDatabase() hasn't executed yet
         - safeCloseStream() hasn't been called yet
         - DB writes are still pending
```

### Root Cause 2: Transient E2B Errors Treated as Fatal

When the E2B gRPC process stream closed (`[unknown] terminated`), `commandHandle.wait()` threw an error. The service unconditionally treated this as a fatal failure:

```typescript
// claude-code-service.ts (BEFORE fix)
if (executionError) {
  callbacks.onError(executionError.message)  // kills the stream
  return                                      // exits immediately
}
```

This happened even when the agent had already streamed all its content via `onStdout` callbacks. The content was delivered to the frontend, but then the error handler killed the stream and prevented the completion signal from being sent.

### Root Cause 3: Unconditional Message Trimming

The frontend's `onFinish` callback trimmed messages to the last 2 unconditionally:

```typescript
// page.tsx (BEFORE fix)
if (message.role === 'assistant') {
  setTimeout(() => {
    setMessages((prev) => prev.length > 2 ? prev.slice(-2) : prev)
  }, 100)
}
```

When the stream ended with an error, this trimming could discard error context, leaving the user with no indication of what happened.

### Root Cause 4: No DB Re-sync After Stream Errors

When `onError` fired on the frontend after content had been received, it returned early and did nothing. If the backend had managed to save messages before the stream broke, the frontend had no way to recover that state.

---

## Fix

### 1. Await All Callbacks (Service + Handler)

**Files**: `claude-code-service.ts`, `claude-code-handler.ts`

Updated the callback interfaces to support async functions:

```typescript
// AFTER fix
export interface StreamingCallbacks {
  onMessage: (message: string) => void
  onComplete: (result: AppGenerationResponse) => void | Promise<void>
  onError: (error: string) => void | Promise<void>
}
```

Changed every `callbacks.onComplete(...)` and `callbacks.onError(...)` call to `await callbacks.onComplete(...)` and `await callbacks.onError(...)` across both files. This ensures the entire async chain (DB saves, usage tracking, stream closure) completes before the function returns.

**Locations changed in `claude-code-service.ts`**:
- Line 142: SDK check failure
- Line 417: Silent failure (no output)
- Line 427: Execution error
- Line 432: No execution result
- Line 485: Non-zero exit code
- Line 506: Success completion
- Line 588: Catch block error

**Locations changed in `claude-code-handler.ts`**:
- Line 54: Missing user ID
- Line 59: Missing project ID
- Line 102: Project not found
- Line 131: Container still creating
- Line 141: Failed to find project/sandbox
- Line 292: Success completion (onComplete)
- Line 302: Stream error (onError)
- Line 319: Catch block error

### 2. Don't Kill Stream on Transient E2B Errors

**File**: `claude-code-service.ts`

When `executionError` occurs but content was already streamed (`receivedAnyOutput` is true and either `completionDetected` or `stdoutChunkCount > 5`), fall through to the success path instead of calling `onError`:

```typescript
// AFTER fix
if (executionError) {
  if (receivedAnyOutput && (completionDetected || stdoutChunkCount > 5)) {
    // Fall through to success path — content was already streamed
  } else {
    await callbacks.onError(executionError.message)
    return
  }
}
```

Added null safety for `execution` object in the success path since it can be null in the error recovery scenario (optional chaining on `execution?.exitCode`, `execution?.stdout`, etc.).

### 3. Save Messages Before Stream Closes (Backend)

**File**: `route.ts`

Added a `saveMessagesToDatabase(content, source)` helper inside the stream's `start()` method with a `messagesSavedToDb` guard to prevent double-saves. Called from:

- `onComplete` callback — saves before `safeCloseStream('stop')`
- `onError` callback — saves before `safeCloseStream('error')`
- `catch` block — saves before `safeCloseStream('error')`
- Heartbeat timeout — saves before `safeCloseStream('length')`
- `onFinish` (AI SDK callback) — fallback only, checks `if (!messagesSavedToDb)`

The `saveProjectMessages` function already has deduplication via `originalId` at the database level, providing a safety net against the unlikely event of a double-save.

### 4. Conditional Message Trimming (Frontend)

**File**: `page.tsx`

Only trim messages to the last 2 when the assistant message contains the `✅` success marker. Error responses containing `❌` are preserved so the user sees what went wrong:

```typescript
// AFTER fix
const isSuccessful = message.content?.includes('✅')
if (isSuccessful) {
  setTimeout(() => {
    setMessages((prev) => prev.length > 2 ? prev.slice(-2) : prev)
  }, 100)
}
```

### 5. DB Re-sync After Stream Error (Frontend)

**File**: `page.tsx`

When `onError` fires after content was received (`hasReceivedContentRef.current` is true), added a delayed re-sync from the database:

```typescript
// AFTER fix — inside onError, after early return
setTimeout(async () => {
  const response = await fetch('/api/chat/history', {
    method: 'POST',
    body: JSON.stringify({ projectId, userId, limit: 2 }),
  })
  if (response.ok) {
    const { messages: historyMessages } = await response.json()
    if (historyMessages?.length > 0) {
      setMessages(historyMessages)
    }
  }
}, 2000)
```

The 2-second delay allows the backend save to complete before the frontend fetches.

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/web/lib/claude-code-service.ts` | Await all callbacks; update interface to support async; don't kill stream on transient E2B errors when output was received; null-safe `execution` access |
| `apps/web/lib/claude-code-handler.ts` | Await all callbacks; update interface to support async; make `onError` callback async |
| `apps/web/app/(app)/api/chat/route.ts` | Add `saveMessagesToDatabase` helper; call from all exit paths; make `onFinish` a fallback; add `messagesSavedToDb` guard |
| `apps/web/app/(app)/p/[id]/page.tsx` | Conditional message trimming (only on success); DB re-sync after stream error |

## Files Referenced (no changes needed)

| File | Role |
|------|------|
| `apps/web/lib/db/index.ts` | `saveProjectMessages` — already has deduplication via `originalId` |
| `apps/web/hooks/useStreamRecovery.ts` | Existing stall recovery hook — complements this fix |
| `apps/web/app/(app)/api/chat/history/route.ts` | Existing endpoint used for DB re-sync |

---

## Verification

1. **Happy path**: Send a message -> agent completes -> check server logs for `saveMessagesToDatabase(onComplete)` -> messages saved and trimmed correctly
2. **E2B stream drop**: If `[unknown] terminated` occurs after content was streamed -> verify logs show "treating as completion" -> stream completes normally -> messages saved
3. **True error (no output)**: If error occurs before any output -> verify `onError` fires -> error message shown to user -> messages saved with error content
4. **Frontend re-sync**: After stream error with received content -> verify browser console shows "Re-syncing messages from DB" after ~2s
5. **No duplicate saves**: Check server logs — only one `saveMessagesToDatabase` call should succeed per request (guard prevents doubles)
