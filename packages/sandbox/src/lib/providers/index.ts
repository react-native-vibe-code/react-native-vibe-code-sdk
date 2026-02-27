/**
 * Sandbox Provider Factory
 *
 * Returns the active sandbox provider based on the SANDBOX_PROVIDER environment variable.
 *
 * Usage:
 *   import { getSandboxProvider } from '@react-native-vibe-code/sandbox/lib'
 *
 *   const provider = getSandboxProvider()
 *   const sandbox = await provider.create({ templateId: 'my-template-id' })
 *   // or
 *   const sandbox = await provider.connect(existingSandboxId)
 *
 * Supported values for SANDBOX_PROVIDER:
 *   - 'e2b' (default): E2B Code Interpreter (@e2b/code-interpreter)
 *   - 'daytona': Daytona Workspace (@daytonaio/sdk)
 */

export * from './types'
export { E2BProvider } from './e2b'
export { DaytonaProvider } from './daytona'

import type { ISandboxProvider, SandboxProviderName } from './types'
import { E2BProvider } from './e2b'
import { DaytonaProvider } from './daytona'

let _providerInstance: ISandboxProvider | null = null

/**
 * Returns the singleton sandbox provider for the current process.
 * Provider is determined by the SANDBOX_PROVIDER environment variable.
 *
 * @returns ISandboxProvider - the active provider
 */
export function getSandboxProvider(): ISandboxProvider {
  if (_providerInstance) {
    return _providerInstance
  }

  const providerName = (
    (process.env.SANDBOX_PROVIDER as SandboxProviderName | undefined) ?? 'e2b'
  ).toLowerCase() as SandboxProviderName

  switch (providerName) {
    case 'daytona':
      console.log('[SandboxProvider] Using Daytona provider')
      _providerInstance = new DaytonaProvider()
      break
    case 'e2b':
    default:
      console.log('[SandboxProvider] Using E2B provider (default)')
      _providerInstance = new E2BProvider()
      break
  }

  return _providerInstance
}

/**
 * Reset the provider singleton (useful for testing).
 */
export function resetSandboxProvider(): void {
  _providerInstance = null
}
