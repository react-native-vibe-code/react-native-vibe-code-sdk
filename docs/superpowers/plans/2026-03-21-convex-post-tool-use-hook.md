# Convex PostToolUse Deploy Hook Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Convex schema deployment timing so indexes and functions are available immediately after the agent writes them, not only at session end.

**Architecture:** Replace the `SessionEnd`-only deploy hook with a `PostToolUse` hook that triggers `convex deploy` after any Write/Edit to the `convex/` directory. Keep `SessionEnd` as a safety net. Also fix the missing `--with-convex-deploy` flag in `claude-code-service.ts`.

**Tech Stack:** Claude Agent SDK (TypeScript), E2B sandbox, Convex CLI

---

## File Structure

- **Modify:** `packages/agent/src/hooks/convex-deploy.ts` — Add PostToolUse hook with debouncing and convex path filtering
- **Modify:** `packages/agent/src/types.ts` — Add `onPostToolUse` to `ExecutorHooks` interface
- **Modify:** `packages/agent/src/executor.ts` — Wire PostToolUse hooks into the SDK `hooks` config
- **Modify:** `packages/agent/src/cli.ts` — Register the PostToolUse hook when `--with-convex-deploy` is set
- **Modify:** `apps/web/lib/claude-code-service.ts` — Pass `--with-convex-deploy` flag when Convex is connected

---

## Chunk 1: Hook Infrastructure and Implementation

### Task 1: Add PostToolUse hook type to ExecutorHooks

**Files:**
- Modify: `packages/agent/src/types.ts:44-50`

- [ ] **Step 1: Add PostToolUse hook type to ExecutorHooks interface**

Add a new `onPostToolUse` field alongside the existing `onSessionEnd`:

```typescript
/**
 * Hooks configuration for the agent
 */
export interface ExecutorHooks {
  /** Hooks to run when the session ends */
  onSessionEnd?: SessionHook[]
  /** Hooks to run after a tool is used (e.g., after Write/Edit) */
  onPostToolUse?: SessionHook[]
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/agent/src/types.ts
git commit -m "feat: add onPostToolUse to ExecutorHooks interface"
```

---

### Task 2: Create PostToolUse convex deploy hook with debouncing

**Files:**
- Modify: `packages/agent/src/hooks/convex-deploy.ts`

- [ ] **Step 1: Add the PostToolUse hook factory function**

Add `createConvexPostToolUseHook()` to the existing `convex-deploy.ts` file. This hook:
- Checks if the tool was `Write` or `Edit`
- Checks if the `file_path` is inside the `convex/` directory
- Debounces deploys (waits 2 seconds after the last convex file write before deploying)
- Runs `npx convex deploy --typecheck=disable` non-blocking

```typescript
import { exec } from 'child_process'
import type { SessionHook } from '../types.js'

// Debounce state for PostToolUse convex deploys
let deployDebounceTimer: ReturnType<typeof setTimeout> | null = null
let deployInProgress = false

/**
 * Runs convex deploy to push any schema/function changes to the server
 * This is a safeguard to ensure changes made during the session are deployed
 */
async function runConvexDeploy(cwd: string): Promise<void> {
  console.log('Running convex deploy...')
  return new Promise((resolve) => {
    exec('npx convex deploy --typecheck=disable', { cwd }, (error, stdout, stderr) => {
      if (error) {
        console.error('Convex deploy failed:', error.message)
        if (stderr) console.error('stderr:', stderr)
      } else {
        console.log('Convex deploy completed')
        if (stdout) console.log('stdout:', stdout)
      }
      // Always resolve - deploy failure shouldn't block session completion
      resolve()
    })
  })
}

/**
 * Creates a session end hook that runs convex deploy
 */
export function createConvexDeployHook(): SessionHook {
  return async (
    input: { hook_event_name: string; cwd: string },
    _toolUseID: string | undefined,
    _options: { signal: AbortSignal }
  ): Promise<{ continue: boolean }> => {
    console.log('SessionEnd hook triggered - running convex deploy')
    await runConvexDeploy(input.cwd)
    return { continue: true }
  }
}

/**
 * Creates a PostToolUse hook that runs convex deploy after Write/Edit
 * operations on files inside the convex/ directory.
 *
 * Debounced: waits 2 seconds after the last convex file change before
 * deploying, so rapid successive writes don't trigger multiple deploys.
 */
export function createConvexPostToolUseHook(): SessionHook {
  return async (
    input: { hook_event_name: string; cwd: string; tool_name?: string; tool_input?: unknown },
    _toolUseID: string | undefined,
    _options: { signal: AbortSignal }
  ): Promise<{ continue: boolean }> => {
    // Only act on Write or Edit tools
    const toolName = (input as any).tool_name
    if (toolName !== 'Write' && toolName !== 'Edit') {
      return { continue: true }
    }

    // Check if the file path is inside a convex/ directory
    const toolInput = (input as any).tool_input as Record<string, unknown> | undefined
    const filePath = toolInput?.file_path as string | undefined
    if (!filePath || !filePath.includes('/convex/')) {
      return { continue: true }
    }

    console.log(`[Convex Hook] Convex file changed: ${filePath}`)

    // Debounce: clear any pending deploy and schedule a new one
    if (deployDebounceTimer) {
      clearTimeout(deployDebounceTimer)
    }

    // Don't block the agent — schedule deploy in background
    deployDebounceTimer = setTimeout(async () => {
      if (deployInProgress) {
        console.log('[Convex Hook] Deploy already in progress, skipping')
        return
      }
      deployInProgress = true
      try {
        console.log('[Convex Hook] Debounce elapsed, running convex deploy...')
        await runConvexDeploy(input.cwd)
      } finally {
        deployInProgress = false
      }
    }, 2000)

    // Don't block the agent — return immediately
    return { continue: true }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/agent/src/hooks/convex-deploy.ts
git commit -m "feat: add PostToolUse convex deploy hook with debouncing"
```

---

### Task 3: Wire PostToolUse hooks into executor

**Files:**
- Modify: `packages/agent/src/executor.ts:115-120`

- [ ] **Step 1: Add PostToolUse hook registration to hooksConfig**

In `executor.ts`, find the hooks configuration block (around line 116-120) and add PostToolUse support:

```typescript
    // Build hooks configuration
    const hooksConfig: Record<string, Array<{ matcher?: string; hooks: Array<(input: { hook_event_name: string; cwd: string }, toolUseID: string | undefined, options: { signal: AbortSignal }) => Promise<{ continue: boolean }>> }>> = {}

    if (hooks?.onSessionEnd && hooks.onSessionEnd.length > 0) {
      hooksConfig['SessionEnd'] = [{ hooks: hooks.onSessionEnd }]
    }

    if (hooks?.onPostToolUse && hooks.onPostToolUse.length > 0) {
      hooksConfig['PostToolUse'] = [{ matcher: 'Write|Edit', hooks: hooks.onPostToolUse }]
    }
```

The `matcher: 'Write|Edit'` ensures the SDK only fires the hook for Write and Edit tool uses, matching the SDK's matcher pattern syntax.

- [ ] **Step 2: Commit**

```bash
git add packages/agent/src/executor.ts
git commit -m "feat: wire PostToolUse hooks into executor with Write|Edit matcher"
```

---

### Task 4: Register PostToolUse hook in CLI

**Files:**
- Modify: `packages/agent/src/cli.ts`

- [ ] **Step 1: Import and register the PostToolUse hook**

Update the CLI to import `createConvexPostToolUseHook` and add it to the hooks when `--with-convex-deploy` is set:

```typescript
#!/usr/bin/env node
import { runExecutor } from './executor.js'
import { parseArgs } from './utils/parse-args.js'
import { createConvexDeployHook, createConvexPostToolUseHook } from './hooks/convex-deploy.js'

async function main() {
  console.log('========================================')
  console.log('CAPSULE AGENT CLI')
  console.log('========================================')
  console.log('Raw process.argv:', process.argv)

  try {
    const args = parseArgs(process.argv)

    // Check for convex deploy flag
    const withConvexDeploy = process.argv.some(arg => arg === '--with-convex-deploy')

    const hooks = withConvexDeploy
      ? {
          onSessionEnd: [createConvexDeployHook()],
          onPostToolUse: [createConvexPostToolUseHook()],
        }
      : undefined

    const result = await runExecutor(args, undefined, hooks)

    if (!result.success) {
      process.exit(1)
    }
  } catch (error) {
    console.error('CLI Error:', error)
    process.exit(1)
  }
}

main()
```

- [ ] **Step 2: Commit**

```bash
git add packages/agent/src/cli.ts
git commit -m "feat: register PostToolUse convex hook alongside SessionEnd hook"
```

---

## Chunk 2: Service Integration

### Task 5: Pass --with-convex-deploy flag in claude-code-service.ts

**Files:**
- Modify: `apps/web/lib/claude-code-service.ts:254`

- [ ] **Step 1: Add the flag when Convex is connected**

Find the command construction line (around line 254):
```typescript
const command = `cd /claude-sdk && bun start -- --prompt="${escapedMessage}"${systemPromptArg}${sessionArg}${modelArg}${imageUrlsArg}`
```

Add the `--with-convex-deploy` flag when `cloudEnabled` is true:

```typescript
const convexDeployArg = cloudEnabled ? ' --with-convex-deploy' : ''
const command = `cd /claude-sdk && bun start -- --prompt="${escapedMessage}"${systemPromptArg}${sessionArg}${modelArg}${imageUrlsArg}${convexDeployArg}`
```

Also add a log line after the existing cloud enabled log:

```typescript
console.log('[Claude Code Service] ☁️ Cloud enabled:', cloudEnabled)
if (cloudEnabled) {
  console.log('[Claude Code Service] ☁️ Convex deploy hook will be enabled')
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/claude-code-service.ts
git commit -m "feat: pass --with-convex-deploy flag when Convex is connected"
```

---

### Task 6: Verify build

- [ ] **Step 1: Type-check the agent package**

```bash
cd packages/agent && npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 2: Type-check the web app**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A && git commit -m "fix: resolve any type errors from convex hook changes"
```
