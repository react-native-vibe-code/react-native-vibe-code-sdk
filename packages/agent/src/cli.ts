#!/usr/bin/env node
import { runExecutor } from './executor.js'
import { parseArgs } from './utils/parse-args.js'
import { createConvexDeployHook, createConvexPostToolUseHook } from './hooks/convex-deploy.js'

/**
 * CLI entry point for the Capsule Agent
 *
 * Usage:
 *   capsule-agent --prompt="Your prompt here" [options]
 *
 * Options:
 *   --prompt=<prompt>              Required. The user prompt to execute
 *   --cwd=<path>                   Working directory (default: /home/user/app)
 *   --model=<model>                Model to use (e.g., claude-opus-4-5-20251101)
 *   --system-prompt=<prompt>       System prompt to append
 *   --system-prompt-file=<path>    Path to system prompt file
 *   --image-urls=<json>            JSON array of image URLs
 *   --with-convex-deploy           Enable convex deploy hook on session end
 */
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
