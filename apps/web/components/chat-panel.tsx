'use client'

import { ChatPanel as BaseChatPanel, type ImageAttachment } from '@react-native-vibe-code/chat/components'
import { ChatPanelInput } from '@/components/chat-panel-input'
import { Messages } from '@/components/chat/messages'
import type { Message } from 'ai'
import type React from 'react'
import { usePusherHoverSelection } from '@/hooks/usePusherHoverSelection'
import { useRemoteControlStatus } from '@/hooks/useRemoteControlStatus'

interface ChatPanelProps {
  messages: Message[]
  input: string
  handleInputChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void
  handleSubmit: (e: React.FormEvent) => void
  isLoading: boolean
  projectTitle?: string
  currentTemplate?: string
  status: 'streaming' | 'error' | 'submitted' | 'ready'
  sandboxId?: string | null
  isSandboxRecovering?: boolean
  pendingEditData?: { fileEdition: string; selectionData: any } | null
  projectId?: string
  userId?: string
  isRetrying?: boolean
  retryCount?: number
  isWaitingForFirstMessage?: boolean
  selectedModel: string
  onModelChange: (modelId: string) => void
  agentType?: 'claude-code' | 'opencode'
  onAgentTypeChange?: (agentType: 'claude-code' | 'opencode') => void
  imageAttachments?: ImageAttachment[]
  onImageAttachmentsChange?: (attachments: ImageAttachment[]) => void
  selectedSkills?: string[]
  onSelectedSkillsChange?: (skills: string[]) => void
  cloudEnabled?: boolean
  isCloudPanelOpen?: boolean
  onCloudPanelOpen?: () => void
  onCloudPanelClose?: () => void
  onIframeRefresh?: () => void
}

export function ChatPanel({
  messages,
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
  status,
  sandboxId,
  isSandboxRecovering = false,
  projectId,
  userId,
  isWaitingForFirstMessage,
  selectedModel,
  onModelChange,
  agentType,
  onAgentTypeChange,
  imageAttachments = [],
  onImageAttachmentsChange,
  selectedSkills = [],
  onSelectedSkillsChange,
  cloudEnabled = false,
  isCloudPanelOpen = false,
  onCloudPanelOpen,
  onCloudPanelClose,
  onIframeRefresh,
}: ChatPanelProps) {
  const { isRemoteControlActive } = useRemoteControlStatus({
    sandboxId: sandboxId ?? null,
    onComplete: onIframeRefresh,
  })

  return (
    <BaseChatPanel
      isRemoteControlActive={isRemoteControlActive}
      messages={messages}
      input={input}
      handleInputChange={handleInputChange}
      handleSubmit={handleSubmit}
      isLoading={isLoading}
      status={status}
      sandboxId={sandboxId}
      projectId={projectId}
      userId={userId}
      isWaitingForFirstMessage={isWaitingForFirstMessage}
      selectedModel={selectedModel}
      onModelChange={onModelChange}
      agentType={agentType}
      onAgentTypeChange={onAgentTypeChange}
      imageAttachments={imageAttachments}
      onImageAttachmentsChange={onImageAttachmentsChange}
      selectedSkills={selectedSkills}
      onSelectedSkillsChange={onSelectedSkillsChange}
      cloudEnabled={cloudEnabled}
      isCloudPanelOpen={isCloudPanelOpen}
      onCloudPanelOpen={onCloudPanelOpen}
      onCloudPanelClose={onCloudPanelClose}
      useHoverSelection={usePusherHoverSelection}
      renderMessages={(props) => (
        <Messages
          messages={props.messages}
          status={props.status}
          isLoading={props.isLoading}
          projectId={props.projectId}
          sandboxId={props.sandboxId}
          userId={props.userId}
          onRestore={props.onRestore}
          restoringMessageId={props.restoringMessageId}
          isWaitingForFirstMessage={props.isWaitingForFirstMessage}
        />
      )}
      renderInput={(props) => (
        <ChatPanelInput
          input={props.input}
          handleInputChange={props.handleInputChange}
          handleSubmit={props.handleSubmit}
          isLoading={props.isLoading}
          sandboxId={props.sandboxId}
          isSandboxRecovering={isSandboxRecovering}
          isHoverModeEnabled={props.isHoverModeEnabled}
          onToggleHoverMode={props.onToggleHoverMode}
          onDisableHoverMode={props.onDisableHoverMode}
          latestSelection={props.latestSelection}
          onScrollToBottom={() => {}}
          selectedModel={props.selectedModel}
          onModelChange={props.onModelChange}
          agentType={props.agentType}
          onAgentTypeChange={props.onAgentTypeChange}
          imageAttachments={props.imageAttachments}
          onImageAttachmentsChange={props.onImageAttachmentsChange}
          selectedSkills={props.selectedSkills}
          onSelectedSkillsChange={props.onSelectedSkillsChange}
          cloudEnabled={props.cloudEnabled}
          isCloudPanelOpen={props.isCloudPanelOpen}
          onCloudPanelOpen={props.onCloudPanelOpen}
          onCloudPanelClose={props.onCloudPanelClose}
        />
      )}
    />
  )
}

export type { ImageAttachment }
