// Type definitions for models supported by each agent type

export type AgentType = 'claude-code' | 'opencode'

export interface ClaudeModel {
  id: string
  name: string
  description: string
  isDefault?: boolean
}

export const CLAUDE_MODELS: ClaudeModel[] = [
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    description: 'Balanced performance and speed',
    isDefault: true,
  },
  {
    id: 'claude-opus-4-5-20251101',
    name: 'Claude Opus 4.5',
    description: 'Most capable model for complex tasks',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    description: 'Fastest responses',
  },
]

export const OPENCODE_MODELS: ClaudeModel[] = [
  {
    id: 'anthropic/claude-opus-4-5',
    name: 'Claude Opus 4.5',
    description: 'Most capable model for complex tasks',
    isDefault: true,
  },
  {
    id: 'anthropic/claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    description: 'Balanced performance and speed',
  },
  {
    id: 'anthropic/claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    description: 'Fastest responses',
  },
]

export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-5-20250929'
export const DEFAULT_OPENCODE_MODEL = 'anthropic/claude-opus-4-5'

export const CLAUDE_MODEL_STORAGE_KEY = 'capsule-claude-model'
export const AGENT_TYPE_STORAGE_KEY = 'capsule-agent-type'

export function getModelsForAgent(agentType: AgentType): ClaudeModel[] {
  return agentType === 'opencode' ? OPENCODE_MODELS : CLAUDE_MODELS
}

export function getDefaultModelForAgent(agentType: AgentType): string {
  return agentType === 'opencode' ? DEFAULT_OPENCODE_MODEL : DEFAULT_CLAUDE_MODEL
}

export function getClaudeModelById(id: string): ClaudeModel | undefined {
  return CLAUDE_MODELS.find((m) => m.id === id) || OPENCODE_MODELS.find((m) => m.id === id)
}

/** Returns the model ID to use, falling back to the agent's default if the current value doesn't match */
export function resolveModelForAgent(value: string, agentType: AgentType): string {
  const models = getModelsForAgent(agentType)
  if (models.some((m) => m.id === value)) return value
  return getDefaultModelForAgent(agentType)
}

export function getDefaultClaudeModel(): ClaudeModel {
  return CLAUDE_MODELS.find((m) => m.isDefault) || CLAUDE_MODELS[0]
}
