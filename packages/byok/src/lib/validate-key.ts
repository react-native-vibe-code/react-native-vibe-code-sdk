import Anthropic from '@anthropic-ai/sdk'
import type { ByokValidationResult } from '../types/index'

/**
 * Validates an Anthropic API key by making a minimal test request.
 * Never logs the key value.
 */
export async function validateAnthropicKey(key: string): Promise<ByokValidationResult> {
  if (!key || !key.startsWith('sk-ant-')) {
    return { valid: false, error: 'Key must start with sk-ant-' }
  }

  try {
    const client = new Anthropic({ apiKey: key })
    await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    })
    return { valid: true }
  } catch (err: any) {
    if (err?.status === 401) {
      return { valid: false, error: 'Invalid API key' }
    }
    if (err?.status === 403) {
      return { valid: false, error: 'Key does not have required permissions' }
    }
    return { valid: false, error: err?.message || 'Validation failed' }
  }
}
