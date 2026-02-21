/**
 * Provider Factory
 *
 * Returns the correct AIProvider implementation based on the CLAUDE_PROVIDER
 * environment variable:
 *
 *   CLAUDE_PROVIDER=sandboxed   (default) → SandboxedClaudeProvider
 *   CLAUDE_PROVIDER=local-cli             → LocalCLIProvider
 *
 * Usage:
 *   import { createProvider, getProviderMode } from '@/lib/providers/factory'
 *   const provider = createProvider()
 *   await provider.generate(request, callbacks)
 */

import type { AIProvider, ProviderMode } from './types'

export function getProviderMode(): ProviderMode {
  const raw = process.env.CLAUDE_PROVIDER ?? 'sandboxed'
  if (raw === 'local-cli' || raw === 'sandboxed') {
    return raw
  }
  console.warn(
    `[ProviderFactory] Unknown CLAUDE_PROVIDER value "${raw}", falling back to "sandboxed"`,
  )
  return 'sandboxed'
}

export function isLocalCLIMode(): boolean {
  return getProviderMode() === 'local-cli'
}

/**
 * Creates and returns the active AI provider.
 *
 * Providers are stateless — a new instance is safe to create per request.
 */
export function createProvider(): AIProvider {
  const mode = getProviderMode()

  switch (mode) {
    case 'local-cli': {
      // Lazy import to avoid pulling child_process / fs into sandboxed builds
      const { LocalCLIProvider } = require('./local-cli-provider') as typeof import('./local-cli-provider')
      return new LocalCLIProvider()
    }

    case 'sandboxed':
    default: {
      // The sandboxed provider wraps ClaudeCodeService + E2B.
      // It is the default and production mode.
      const { SandboxedClaudeProvider } = require('./sandboxed-provider') as typeof import('./sandboxed-provider')
      return new SandboxedClaudeProvider()
    }
  }
}
