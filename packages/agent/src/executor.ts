import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import * as fs from 'fs'
import * as path from 'path'
import { downloadImage } from './utils/download-image.js'
import { loadEnvFile } from './utils/env-loader.js'
import { slimifyMessage } from './slim-message.js'
import type { ExecutorArgs, ExecutorConfig, ExecutorHooks, ExecutorResult } from './types.js'

const DEFAULT_CONFIG: Required<ExecutorConfig> = {
  defaultCwd: '/home/user/app',
  envPath: '/claude-sdk/.env',
  imagesDir: '/tmp/attached-images',
  heartbeatInterval: 30000,
}

/**
 * Runs the Claude Agent executor with the given arguments and configuration
 */
export async function runExecutor(
  args: ExecutorArgs,
  config?: ExecutorConfig,
  hooks?: ExecutorHooks
): Promise<ExecutorResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const cwd = args.cwd || cfg.defaultCwd

  console.log('========================================')
  console.log('CAPSULE AGENT STARTING')
  console.log('========================================')
  console.log('Version: agent-package-v1')

  // Load environment variables
  loadEnvFile(cfg.envPath)

  // Debug environment
  console.log('Environment check:')
  console.log('- Working directory:', cwd)
  console.log('- ANTHROPIC_API_KEY exists:', !!process.env.ANTHROPIC_API_KEY)
  console.log('- ANTHROPIC_API_KEY length:', process.env.ANTHROPIC_API_KEY?.length || 0)

  // Ensure target directory exists
  try {
    const fullPath = path.resolve(cwd)
    if (!fs.existsSync(fullPath)) {
      console.log('Creating directory:', fullPath)
      fs.mkdirSync(fullPath, { recursive: true })
    }
    console.log('Directory exists and is accessible:', fullPath)
  } catch (err) {
    console.error('Directory check failed:', err)
  }

  const messages: SDKMessage[] = []

  // Heartbeat to keep connection alive during long operations
  const heartbeatInterval = setInterval(() => {
    console.log('Streaming: [Heartbeat - Agent is working...]')
  }, cfg.heartbeatInterval)

  try {
    console.log('Starting Claude Code query...')
    console.log('Streaming: Initializing AI Code Agent...')

    // Build prompt with images if provided
    let finalPrompt = args.prompt
    const downloadedImagePaths: string[] = []

    if (args.imageUrls && args.imageUrls.length > 0) {
      console.log('========================================')
      console.log('DOWNLOADING IMAGES TO LOCAL FILES')
      console.log('========================================')
      console.log('Streaming: Processing request with', args.imageUrls.length, 'attached images...')

      // Create images directory if it doesn't exist
      if (!fs.existsSync(cfg.imagesDir)) {
        fs.mkdirSync(cfg.imagesDir, { recursive: true })
      }

      // Download each image
      for (let i = 0; i < args.imageUrls.length; i++) {
        const url = args.imageUrls[i]
        if (!url) continue

        // Extract extension from URL or default to .png
        const urlPath = new URL(url).pathname
        const ext = path.extname(urlPath) || '.png'
        const filename = `image-${i + 1}${ext}`
        const destPath = path.join(cfg.imagesDir, filename)

        console.log(`Downloading image ${i + 1}/${args.imageUrls.length}: ${url.substring(0, 80)}...`)
        try {
          await downloadImage(url, destPath)
          downloadedImagePaths.push(destPath)
          console.log(`Image ${i + 1} saved to: ${destPath}`)
        } catch (err) {
          console.error(`Failed to download image ${i + 1}:`, err)
          // Continue with other images even if one fails
        }
      }

      // Prepend image file references to the prompt
      if (downloadedImagePaths.length > 0) {
        const imageInstructions = downloadedImagePaths
          .map((imgPath, i) => `- Image ${i + 1}: ${imgPath}`)
          .join('\n')

        finalPrompt = `The user has attached ${downloadedImagePaths.length} image(s) for reference. Please read and analyze these images to understand the context:\n${imageInstructions}\n\nUser request:\n${args.prompt}`

        console.log('Added', downloadedImagePaths.length, 'image file references to prompt')
      } else {
        console.log('No images were successfully downloaded, proceeding with text-only prompt')
      }
    }

    // Build hooks configuration
    const hooksConfig: Record<string, Array<{ hooks: Array<(input: { hook_event_name: string; cwd: string }, toolUseID: string | undefined, options: { signal: AbortSignal }) => Promise<{ continue: boolean }>> }>> = {}

    if (hooks?.onSessionEnd && hooks.onSessionEnd.length > 0) {
      hooksConfig['SessionEnd'] = [{ hooks: hooks.onSessionEnd }]
    }

    // Build system prompt option
    const systemPromptOption = args.systemPrompt
      ? {
          type: 'preset' as const,
          preset: 'claude_code' as const,
          append: args.systemPrompt,
        }
      : undefined

    if (args.systemPrompt) {
      console.log('System prompt loaded, length:', args.systemPrompt.length)
    } else {
      console.log('WARNING: No system prompt provided — agent will use default behavior')
    }

    for await (const message of query({
      prompt: finalPrompt,
      options: {
        cwd,
        permissionMode: 'bypassPermissions',
        // Load skills from filesystem - required for Agent Skills to work
        settingSources: ['user', 'project'],
        // Pass system prompt so agent knows it's a React Native/Expo builder
        ...(systemPromptOption && { systemPrompt: systemPromptOption }),
        // Pass model selection if provided
        ...(args.model && { model: args.model }),
        // Add hooks if configured
        ...(Object.keys(hooksConfig).length > 0 && { hooks: hooksConfig }),
      } as any,
    })) {
      messages.push(message)

      // Stream slimified messages — small JSON that never spans multiple stdout chunks
      const slimMessages = slimifyMessage(message)
      for (const slim of slimMessages) {
        console.log(`Streaming: ${JSON.stringify(slim)}`)
      }

      // Also stream completion status separately for easier detection
      if (message.type === 'result') {
        if (message.subtype === 'success') {
          console.log(`Streaming: Task completed successfully`)
          console.log(`Streaming: Cost: $${message.total_cost_usd.toFixed(4)}, Duration: ${(message.duration_ms / 1000).toFixed(2)}s`)
        } else {
          console.log(`Streaming: Task failed: ${message.subtype}`)
        }
      }
    }

    console.log('Query completed successfully')
    console.log('CLAUDE_CODE_COMPLETE')
    console.log(JSON.stringify({ success: true, messages }, null, 2))

    return { success: true, messages }
  } catch (error) {
    console.error('Error occurred:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(JSON.stringify({ success: false, error: errorMessage }, null, 2))

    return { success: false, messages, error: errorMessage }
  } finally {
    clearInterval(heartbeatInterval)
  }
}
