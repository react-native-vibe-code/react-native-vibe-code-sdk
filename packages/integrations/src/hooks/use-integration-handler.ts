/**
 * Integration Handler Hook
 *
 * This hook manages writing integration templates to sandboxes.
 * It's used by the chat system to enable integrations when users select them.
 */

import { getIntegrationTemplate, getIntegrationFilePath, getIntegrationDirPath } from '../templates'
import { validateIntegrationIds, getIntegration } from '../config'

/**
 * Options for handling integrations
 */
export interface IntegrationHandlerOptions {
  /** Base URL for API endpoints (e.g., production URL) */
  baseUrl: string
  /** Sandbox interface with file operations */
  sandbox?: {
    files: {
      makeDir: (path: string) => Promise<void>
      write: (path: string, content: string) => Promise<void>
    }
  }
}

/**
 * Result of writing integrations to sandbox
 */
export interface IntegrationHandlerResult {
  /** Integration IDs that were successfully written */
  written: string[]
  /** Integration IDs that failed */
  failed: string[]
  /** Invalid integration IDs that were skipped */
  invalid: string[]
}

/**
 * Write integration skill files to a sandbox
 *
 * This function:
 * 1. Validates the provided integration IDs
 * 2. Generates templates for each valid integration
 * 3. Writes SKILL.md files to .claude/skills/{id}/ in the sandbox
 *
 * @param integrationIds - Array of integration IDs to write
 * @param options - Handler options including baseUrl and sandbox
 * @returns Result with written, failed, and invalid IDs
 *
 * @example
 * ```typescript
 * import { writeIntegrationsToSandbox } from '@react-native-vibe-code/integrations/hooks'
 *
 * const result = await writeIntegrationsToSandbox(
 *   ['anthropic-chat', 'google-search'],
 *   {
 *     baseUrl: 'https://reactnativevibecode.com',
 *     sandbox: sandboxInstance,
 *   }
 * )
 *
 * console.log(`Wrote ${result.written.length} integrations`)
 * ```
 */
export async function writeIntegrationsToSandbox(
  integrationIds: string[],
  options: IntegrationHandlerOptions
): Promise<IntegrationHandlerResult> {
  const result: IntegrationHandlerResult = {
    written: [],
    failed: [],
    invalid: [],
  }

  if (!integrationIds || integrationIds.length === 0) {
    return result
  }

  if (!options.sandbox) {
    console.warn('[Integrations] No sandbox provided, skipping integration file writing')
    return result
  }

  // Validate integration IDs
  const invalidIds = validateIntegrationIds(integrationIds)
  if (invalidIds.length > 0) {
    console.warn('[Integrations] Invalid integration IDs:', invalidIds)
    result.invalid = invalidIds
  }

  // Filter to valid IDs only
  const validIds = integrationIds.filter(id => !invalidIds.includes(id))

  // Write each integration
  for (const integrationId of validIds) {
    try {
      const content = getIntegrationTemplate(integrationId, options.baseUrl)
      if (!content) {
        console.warn(`[Integrations] Template not found for: ${integrationId}`)
        result.failed.push(integrationId)
        continue
      }

      const dirPath = getIntegrationDirPath(integrationId)
      const filePath = getIntegrationFilePath(integrationId)

      // Create directory and write file
      await options.sandbox.files.makeDir(dirPath)
      await options.sandbox.files.write(filePath, content)

      result.written.push(integrationId)
      console.log(`[Integrations] Wrote skill file for: ${integrationId}`)
    } catch (error) {
      console.error(`[Integrations] Failed to write skill file for ${integrationId}:`, error)
      result.failed.push(integrationId)
    }
  }

  return result
}

/**
 * Get integration descriptions for prompt enhancement
 *
 * This function returns a formatted string describing the selected integrations,
 * suitable for appending to user prompts.
 *
 * @param integrationIds - Array of integration IDs
 * @returns Formatted description string
 *
 * @example
 * ```typescript
 * import { getIntegrationDescriptions } from '@react-native-vibe-code/integrations/hooks'
 *
 * const descriptions = getIntegrationDescriptions(['anthropic-chat', 'google-search'])
 * // Returns:
 * // "- AI Chat (Claude): Add AI text generation with Claude
 * //  - Google Search: Add web search capabilities"
 * ```
 */
export function getIntegrationDescriptions(integrationIds: string[]): string {
  if (!integrationIds || integrationIds.length === 0) {
    return ''
  }

  const descriptions = integrationIds
    .map(id => {
      const integration = getIntegration(id)
      if (!integration) return null
      return `- ${integration.name}: ${integration.description}`
    })
    .filter(Boolean)
    .join('\n')

  return descriptions
}

/**
 * Create a prompt suffix for integrations
 *
 * This returns the full prompt text to append when integrations are selected.
 *
 * @param integrationIds - Array of integration IDs
 * @returns Prompt suffix string
 */
export function createIntegrationPromptSuffix(integrationIds: string[]): string {
  if (!integrationIds || integrationIds.length === 0) {
    return ''
  }

  const descriptions = getIntegrationDescriptions(integrationIds)
  if (!descriptions) return ''

  return `\n\nTesting Skills:\n${descriptions}\n\nTest Skills by asking questions that match their descriptions.`
}
