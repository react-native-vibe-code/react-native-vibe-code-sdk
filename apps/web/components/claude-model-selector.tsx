'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  getClaudeModelById,
  getModelsForAgent,
  getDefaultModelForAgent,
  resolveModelForAgent,
  type AgentType,
} from '@/lib/claude-models'
import { Settings2, Bot, Cpu, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClaudeModelSelectorProps {
  value: string
  onChange: (modelId: string) => void
  disabled?: boolean
  compact?: boolean
  agentType?: AgentType
  onAgentTypeChange?: (agentType: AgentType) => void
}

const AGENTS: { id: AgentType; name: string; description: string }[] = [
  { id: 'claude-code', name: 'Claude Code', description: "Anthropic's agent SDK" },
  { id: 'opencode', name: 'OpenCode', description: 'Open-source coding agent' },
]

export function ClaudeModelSelector({
  value,
  onChange,
  disabled = false,
  compact = false,
  agentType = 'claude-code',
  onAgentTypeChange,
}: ClaudeModelSelectorProps) {
  const models = getModelsForAgent(agentType)
  const currentModel = getClaudeModelById(value)

  // Compact mode: single button that opens a dialog
  if (compact) {
    return (
      <CompactSelector
        value={value}
        onChange={onChange}
        disabled={disabled}
        agentType={agentType}
        onAgentTypeChange={onAgentTypeChange}
        models={models}
        currentModel={currentModel}
      />
    )
  }

  // Full mode: inline selects (used on homepage)
  return (
    <div className="flex items-center gap-1.5">
      {onAgentTypeChange && (
        <Select
          value={agentType}
          onValueChange={(v) => onAgentTypeChange(v as AgentType)}
          disabled={disabled}
        >
          <SelectTrigger className="h-12 w-[160px]">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
              <SelectValue>
                {agentType === 'opencode' ? 'OpenCode' : 'Claude Code'}
              </SelectValue>
            </div>
          </SelectTrigger>
          <SelectContent>
            {AGENTS.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                <div className="flex flex-col">
                  <span className="font-medium">{agent.name}</span>
                  <span className="text-xs text-muted-foreground">{agent.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-12 w-[200px]">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-muted-foreground shrink-0" />
            <SelectValue>
              {currentModel?.name || models[0]?.name}
            </SelectValue>
          </div>
        </SelectTrigger>
        <SelectContent>
          {models.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              <div className="flex flex-col">
                <span className="font-medium">{model.name}</span>
                <span className="text-xs text-muted-foreground">{model.description}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Compact dialog version for space-constrained layouts */
function CompactSelector({
  value,
  onChange,
  disabled,
  agentType = 'claude-code',
  onAgentTypeChange,
  models,
  currentModel,
}: {
  value: string
  onChange: (modelId: string) => void
  disabled: boolean
  agentType: AgentType
  onAgentTypeChange?: (agentType: AgentType) => void
  models: ReturnType<typeof getModelsForAgent>
  currentModel: ReturnType<typeof getClaudeModelById>
}) {
  const [open, setOpen] = useState(false)

  // Resolve value to a valid model for the current agent type
  const resolvedValue = resolveModelForAgent(value, agentType)

  // Auto-correct the parent if stored value doesn't match
  if (resolvedValue !== value) {
    // Schedule for next tick to avoid setState during render
    setTimeout(() => onChange(resolvedValue), 0)
  }

  const handleAgentChange = (newAgent: AgentType) => {
    if (onAgentTypeChange) {
      onAgentTypeChange(newAgent)
      onChange(getDefaultModelForAgent(newAgent))
    }
  }

  const handleModelChange = (modelId: string) => {
    onChange(modelId)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-10 text-xs border-gray-200 gap-1.5"
        >
          <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="hidden sm:inline">
            {agentType === 'opencode' ? 'OpenCode' : 'Claude Code'} · {getClaudeModelById(resolvedValue)?.name || models[0]?.name}
          </span>
          <span className="sm:hidden">{agentType === 'opencode' ? 'OC' : 'CC'}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[360px] relative">
        <button
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 z-20 p-2 rounded-full bg-background/50 backdrop-blur-sm border border-border/50 text-foreground hover:bg-background/80 transition-all sm:hidden"
        >
          <X className="w-4 h-4" />
        </button>
        <DialogHeader>
          <DialogTitle>Agent Setup</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Agent selector */}
          {onAgentTypeChange && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Agent</label>
              <div className="grid grid-cols-2 gap-2">
                {AGENTS.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => handleAgentChange(agent.id)}
                    className={cn(
                      'relative flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors',
                      agentType === agent.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/30 hover:bg-accent'
                    )}
                  >
                    {agentType === agent.id && (
                      <Check className="absolute top-2 right-2 h-3.5 w-3.5 text-primary" />
                    )}
                    <div className="flex items-center gap-1.5">
                      <Bot className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{agent.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{agent.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Model selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Model</label>
            <div className="space-y-1.5">
              {models.map((model) => {
                const isSelected = resolvedValue === model.id
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => handleModelChange(model.id)}
                    className={cn(
                      'relative flex w-full items-start rounded-lg border p-3 text-left transition-colors',
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/30 hover:bg-accent'
                    )}
                  >
                    {isSelected && (
                      <Check className="absolute top-2 right-2 h-3.5 w-3.5 text-primary" />
                    )}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{model.name}</span>
                      <span className="text-xs text-muted-foreground">{model.description}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
