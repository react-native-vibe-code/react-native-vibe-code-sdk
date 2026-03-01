'use client'

import { EditButton } from '@/components/edit-button'
import { Button } from '@/components/ui/button'
import { ClaudeModelSelector } from '@/components/claude-model-selector'
import { ChatEditor, type ChatEditorRef } from '@/components/tiptap'
import { ArrowUp, X, FileText, Mic, MicOff, Image as ImageIcon, Cloud } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type React from 'react'
import { useState, useEffect, useRef, memo, useCallback } from 'react'
import {
  useDeepgram,
  LiveConnectionState,
  LiveTranscriptionEvents,
  type LiveTranscriptionEvent
} from '@/context/deepgram-context'
import {
  useMicrophone,
  MicrophoneEvents,
  MicrophoneState
} from '@/context/microphone-context'
import { useKeyboardShortcuts } from '@/context/keyboard-shortcuts-context'
import { useAudioRecorder } from '@/hooks/use-audio-recorder'
import { isMobileDevice } from '@/lib/utils/device-detection'
import type { AISkill } from '@/lib/skills'
import { AI_SKILLS } from '@/lib/skills'

interface HoverSelectionData {
  elementId: string
  content: string
  className: string
  tagName: string
  timestamp: number
  path?: string
  dataAt?: string | null
  dataIn?: string | null
  dataIs?: string | null
}

export interface ImageAttachment {
  url: string
  contentType: string
  name: string
  size: number
}

interface ChatRequestOptions {
  body?: Record<string, unknown>
  data?: Record<string, unknown>
  experimental_attachments?: ImageAttachment[]
}

interface ChatPanelInputProps {
  input: string
  handleInputChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void
  handleSubmit: (e: React.FormEvent, options?: ChatRequestOptions) => void
  isLoading: boolean
  sandboxId?: string | null
  isHoverModeEnabled: boolean
  onToggleHoverMode: (enabled: boolean) => void
  onDisableHoverMode: () => void
  latestSelection?: HoverSelectionData | null
  onScrollToBottom?: () => void
  selectedModel: string
  onModelChange: (modelId: string) => void
  imageAttachments?: ImageAttachment[]
  onImageAttachmentsChange?: (attachments: ImageAttachment[]) => void
  selectedSkills?: string[]
  onSelectedSkillsChange?: (skills: string[]) => void
  cloudEnabled?: boolean
  isCloudPanelOpen?: boolean
  onCloudPanelOpen?: () => void
  onCloudPanelClose?: () => void
}

export const ChatPanelInput = memo(function ChatPanelInput({
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
  sandboxId,
  isHoverModeEnabled,
  onToggleHoverMode,
  onDisableHoverMode,
  latestSelection,
  onScrollToBottom,
  selectedModel,
  onModelChange,
  imageAttachments = [],
  onImageAttachmentsChange,
  selectedSkills = [],
  onSelectedSkillsChange,
  cloudEnabled = false,
  isCloudPanelOpen = false,
  onCloudPanelOpen,
  onCloudPanelClose,
}: ChatPanelInputProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [caption, setCaption] = useState<string>('')
  const [isMicrophoneSetup, setIsMicrophoneSetup] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isUploadingImages, setIsUploadingImages] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<ChatEditorRef>(null)
  
  // Check if realtime voice is enabled (true = Deepgram live, false = Whisper)
  const useRealtimeVoice = process.env.NEXT_PUBLIC_REALTIME_VOICE === 'true'
  
  const captionTimeout = useRef<any>()
  const keepAliveInterval = useRef<any>()
  const baseInputRef = useRef<string>('')
  const recordSoundRef = useRef<HTMLAudioElement | null>(null)
  
  const { connection, connectToDeepgram, disconnectFromDeepgram, connectionState } = useDeepgram()
  const { setupMicrophone, microphone, startMicrophone, stopMicrophone, microphoneState } = useMicrophone()
  const { registerShortcut, unregisterShortcut } = useKeyboardShortcuts()
  
  // Audio recorder for Whisper transcription
  const audioRecorder = useAudioRecorder()
  
  // Transcribe audio using Whisper API
  const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
    try {
      setIsTranscribing(true)

      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || 'Failed to transcribe audio'
        throw new Error(errorMessage)
      }

      const { text } = await response.json()
      return text
    } catch (error) {
      console.error('Transcription error:', error)
      throw error
    } finally {
      setIsTranscribing(false)
    }
  }

  // Handle file input change - upload to Vercel Blob
  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const imageFiles = files.filter(file => file.type.startsWith('image/'))

    if (imageFiles.length === 0) return

    setIsUploadingImages(true)

    try {
      // Upload each image to Vercel Blob
      const uploadPromises = imageFiles.map(async (file) => {
        const formData = new FormData()
        formData.append('file', file)

        const response = await fetch('/api/upload-image', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          throw new Error(`Failed to upload ${file.name}`)
        }

        return await response.json() as ImageAttachment
      })

      const newAttachments = await Promise.all(uploadPromises)

      if (onImageAttachmentsChange) {
        onImageAttachmentsChange([...imageAttachments, ...newAttachments])
      }
    } catch (error) {
      console.error('Error uploading images:', error)
      alert('Failed to upload one or more images. Please try again.')
    } finally {
      setIsUploadingImages(false)
      // Reset the input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Remove an image attachment
  const handleRemoveImage = (index: number) => {
    if (onImageAttachmentsChange) {
      onImageAttachmentsChange(imageAttachments.filter((_, i) => i !== index))
    }
  }

  useEffect(() => {
    // Detect if we're on mobile
    setIsMobile(isMobileDevice())
    
    // Don't setup microphone on mount, wait for user interaction
    
    // Preload the recording sound
    const audio = new Audio('https://etq42zw2k4.ufs.sh/f/Ygf2KSyPE9xcc8MKS2xOv0clTFLAMPxRXIetKY3VjanB6wEr')
    audio.volume = 0.5
    audio.preload = 'auto'
    recordSoundRef.current = audio
    
    audio.load() // Force load the audio
    
    // Register keyboard shortcut for focusing input
    const focusInput = () => {
      editorRef.current?.focus()
    }
    registerShortcut('focus-input', focusInput)
    
    // Register global callback for command palette
    ;(window as any).__focusInputCallback = focusInput
    
    // Register keyboard shortcut for toggling edit mode
    const toggleEdit = () => {
      if (sandboxId && !isLoading) {
        onToggleHoverMode(!isHoverModeEnabled)
      }
    }
    registerShortcut('toggle-edit', toggleEdit)
    
    // Register keyboard shortcut for toggling recording
    const toggleRecordingShortcut = async () => {
      await toggleRecording()
    }
    registerShortcut('toggle-recording', toggleRecordingShortcut)
    
    // Register global callback for command palette
    ;(window as any).__toggleRecordingCallback = toggleRecordingShortcut
    
    return () => {
      unregisterShortcut('focus-input')
      unregisterShortcut('toggle-edit')
      unregisterShortcut('toggle-recording')
      delete (window as any).__focusInputCallback
      delete (window as any).__toggleRecordingCallback
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandboxId, isLoading, isHoverModeEnabled, onToggleHoverMode])

  // Handle recording state changes for Deepgram live transcription
  useEffect(() => {
    // Only handle live transcription if useRealtimeVoice is true
    if (!useRealtimeVoice) return
    
    if (isRecording && isMicrophoneSetup && microphoneState === MicrophoneState.Ready) {
      // Store the current input when starting recording
      baseInputRef.current = input
      setCaption('')
      connectToDeepgram({
        model: "nova-3",
        interim_results: true,
        smart_format: true,
        filler_words: true,
        utterance_end_ms: 3000,
      })
    } else if (!isRecording && connection) {
      stopMicrophone()
      disconnectFromDeepgram()
      setCaption('')
      // Reset base input to current state
      baseInputRef.current = input
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, isMicrophoneSetup, microphoneState, useRealtimeVoice])

  useEffect(() => {
    // Only handle live transcription if useRealtimeVoice is true
    if (!useRealtimeVoice) return
    if (!microphone) return
    if (!connection) return

    const onData = (e: BlobEvent) => {
      // iOS SAFARI FIX:
      // Prevent packetZero from being sent. If sent at size 0, the connection will close. 
      if (e.data.size > 0) {
        connection?.send(e.data)
      }
    }

    const onTranscript = (data: LiveTranscriptionEvent) => {
      const { is_final: isFinal, speech_final: speechFinal } = data
      let thisCaption = data.channel.alternatives[0].transcript

      if (thisCaption !== "") {
        setCaption(thisCaption)
        
        // Update the input field in real-time with base + current caption
        const fullText = baseInputRef.current + (baseInputRef.current ? ' ' : '') + thisCaption
        const event = {
          target: { value: fullText },
        } as React.ChangeEvent<HTMLTextAreaElement>
        handleInputChange(event)
      }

      if (isFinal && speechFinal) {
        // When speech is final, update the base input and clear caption
        baseInputRef.current = baseInputRef.current + (baseInputRef.current ? ' ' : '') + thisCaption
        setCaption('')
        
        clearTimeout(captionTimeout.current)
        captionTimeout.current = setTimeout(() => {
          setCaption('')
          clearTimeout(captionTimeout.current)
        }, 3000)
      }
    }

    if (connectionState === LiveConnectionState.OPEN) {
      connection.addListener(LiveTranscriptionEvents.Transcript, onTranscript)
      microphone.addEventListener(MicrophoneEvents.DataAvailable, onData)

      if (isRecording) {
        startMicrophone()
      }
    }

    return () => {
      // prettier-ignore
      connection.removeListener(LiveTranscriptionEvents.Transcript, onTranscript)
      microphone.removeEventListener(MicrophoneEvents.DataAvailable, onData)
      clearTimeout(captionTimeout.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionState, isRecording, useRealtimeVoice])

  useEffect(() => {
    // Only handle live transcription if useRealtimeVoice is true
    if (!useRealtimeVoice) return
    if (!connection) return

    if (
      microphoneState !== MicrophoneState.Open &&
      connectionState === LiveConnectionState.OPEN
    ) {
      connection.keepAlive()

      keepAliveInterval.current = setInterval(() => {
        connection.keepAlive()
      }, 10000)
    } else {
      clearInterval(keepAliveInterval.current)
    }

    return () => {
      clearInterval(keepAliveInterval.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [microphoneState, connectionState, useRealtimeVoice])

  const toggleRecording = async () => {
    if (useRealtimeVoice) {
      // Use live transcription with Deepgram
      // Setup microphone on first use if not already setup
      if (!isMicrophoneSetup && !isRecording) {
        try {
          await setupMicrophone()
          setIsMicrophoneSetup(true)
        } catch (err) {
          console.error('Failed to setup microphone:', err)
          return
        }
      }
      
      if (!isRecording) {
        // Play preloaded sound when starting to record
        try {
          if (recordSoundRef.current) {
            recordSoundRef.current.currentTime = 0 // Reset to beginning
            await recordSoundRef.current.play()
          }
        } catch (err) {
          console.error('Audio play failed:', err)
        }
      }
      setIsRecording(!isRecording)
    } else {
      // Use Whisper transcription (non-realtime)
      if (!isRecording) {
        try {
          // Store the current input when starting recording
          baseInputRef.current = input
          
          // Play preloaded sound when starting to record
          if (recordSoundRef.current) {
            recordSoundRef.current.currentTime = 0
            recordSoundRef.current.play().catch(err => console.error('Audio play failed:', err))
          }
          
          await audioRecorder.startRecording()
          setIsRecording(true)
        } catch (err) {
          console.error('Failed to start audio recording:', err)
        }
      } else {
        try {
          const audioBlob = await audioRecorder.stopRecording()
          setIsRecording(false)

          if (audioBlob) {
            // Transcribe the audio
            try {
              const transcription = await transcribeAudio(audioBlob)
              if (transcription) {
                // Append transcription to input
                const fullText = baseInputRef.current + (baseInputRef.current ? ' ' : '') + transcription
                // Update the TipTap editor content directly (same pattern as chat-input.tsx)
                if (editorRef.current) {
                  editorRef.current.setContent(fullText)
                } else {
                  const event = {
                    target: { value: fullText },
                  } as React.ChangeEvent<HTMLTextAreaElement>
                  handleInputChange(event)
                }
              }
            } catch (transcriptionError: any) {
              // Show user-friendly error message
              const errorMessage = transcriptionError.message || 'Failed to transcribe audio'
              alert(`Transcription failed: ${errorMessage}\n\nPlease try recording a shorter message.`)
            }
          }

          // Reset the audio recorder
          audioRecorder.resetRecording()
        } catch (err) {
          console.error('Failed to stop recording:', err)
          setIsRecording(false)
          audioRecorder.resetRecording()
        }
      }
    }
  }
  
  // Create file edition reference from selection data
  const getFileEditionRef = () => {
    if (!latestSelection) return null

    // Use dataAt if available (e.g., "CurrentToast.tsx:37-39")
    if (latestSelection.dataAt) {
      return latestSelection.dataAt
    }

    // Fallback to path-based reference if dataAt is not available
    const filename = latestSelection.path || `${latestSelection.tagName}.tsx`
    return `${filename}:${latestSelection.elementId}`
  }

  // Enhanced submit handler that includes file edition metadata
  const enhancedHandleSubmit = (e: React.FormEvent) => {
    // Stop recording if currently recording
    if (isRecording) {
      setIsRecording(false)
    }

    // Build options for handleSubmit
    const options: ChatRequestOptions = {}

    // Pass file edition and selection data via body
    if (latestSelection) {
      const fileEditionRef = getFileEditionRef()
      options.body = {
        fileEdition: fileEditionRef,
        selectionData: latestSelection,
      }
    }

    // Pass selected skills via body
    if (selectedSkills.length > 0) {
      options.body = {
        ...options.body,
        skills: selectedSkills,
      }
    }

    // Store attachments for the request before clearing
    const attachmentsToSend = imageAttachments.length > 0 ? [...imageAttachments] : []

    // Pass image attachments via experimental_attachments - this attaches them directly to the user message
    if (attachmentsToSend.length > 0) {
      options.experimental_attachments = attachmentsToSend
      options.data = {
        imageAttachments: attachmentsToSend,
      }
    }

    // Pass options through handleSubmit's second parameter
    handleSubmit(e, Object.keys(options).length > 0 ? options : undefined)

    // Clear the TipTap editor content
    editorRef.current?.clearContent()

    // Clear image attachments immediately on submit (not in onFinish)
    // This is safe now because experimental_prepareRequestBody checks the message's
    // experimental_attachments first (which AI SDK sets from options above)
    if (attachmentsToSend.length > 0 && onImageAttachmentsChange) {
      onImageAttachmentsChange([])
    }

    // Clear skills after submit
    if (selectedSkills.length > 0 && onSelectedSkillsChange) {
      onSelectedSkillsChange([])
    }

    // Scroll to bottom after submit
    onScrollToBottom?.()

    // Toggle hover mode off after submitting an edit message
    if (latestSelection) {
      onDisableHoverMode()
    }
  }

  return (
    <div
      className="p-2 pt-0 border-t bg-background flex-shrink-0 md:relative md:pb-4 min-h-[214px] md:min-h-0 absolute bottom-[5px]"
      style={{
        // On mobile, use sticky positioning and account for safe area
        // paddingBottom: isMobile ? 'max(1rem, env(safe-area-inset-bottom))' : undefined,
      }}
    >
      {/* Show selection indicator when element is selected */}
      {latestSelection && (
        <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <div className="text-sm">
                <div className="font-medium text-blue-800 dark:text-blue-200">
                  Selected: {latestSelection.tagName}
                </div>
                {getFileEditionRef() && (
                  <div className="text-blue-600 dark:text-blue-400 text-xs font-mono">
                    {getFileEditionRef()?.substring(0,40)}
                    ...
                  </div>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDisableHoverMode}
              className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          {/* {latestSelection.className && (
            <div className="mt-1 text-xs text-blue-600 dark:text-blue-400">
              Classes: {latestSelection.className}
            </div>
          )} */}
        </div>
      )}

      <form onSubmit={enhancedHandleSubmit} className="flex flex-col space-y-2">
        {/* Hidden file input for image uploads */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInput}
          accept="image/*"
          multiple
          className="hidden"
        />

        {/* Image attachments preview */}
        {imageAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {imageAttachments.map((attachment, index) => (
              <div
                key={`${attachment.url}-${index}`}
                className="relative group"
              >
                <img
                  src={attachment.url}
                  alt={attachment.name}
                  className="h-16 w-16 object-cover rounded-md border border-border"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveImage(index)}
                  className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {isUploadingImages && (
              <div className="h-16 w-16 rounded-md border border-border flex items-center justify-center bg-muted">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
          </div>
        )}

        {/* Textarea wrapper */}
        <div className="relative">
          {/* Input container */}
          <div
            className="w-full min-h-[4.5rem] border border-input bg-background rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background"
            onClick={() => editorRef.current?.focus()}
          >
            <div className="flex flex-wrap items-start gap-1.5 p-3">

              {/* ChatEditor - grows to fill remaining space */}
              <div className="flex-1 min-w-[200px]">
                <ChatEditor
                  ref={editorRef}
                  placeholder={
                    latestSelection
                      ? 'Describe changes for the selected element...'
                      : isRecording
                      ? useRealtimeVoice
                        ? 'Live transcription active...'
                        : 'Recording...'
                      : isTranscribing
                      ? 'Transcribing...'
                      : selectedSkills.length > 0
                      ? 'Describe what you want to build...'
                      : 'Make changes, add new features, type / for integrations...'
                  }
                  disabled={isLoading}
                  onContentChange={(text, skills) => {
                    const event = {
                      target: { value: text },
                    } as React.ChangeEvent<HTMLTextAreaElement>
                    handleInputChange(event)

                    // Sync skills from editor with parent state
                    if (onSelectedSkillsChange) {
                      const skillIds = skills.map(s => s.id)
                      // Only update if different to avoid infinite loops
                      if (JSON.stringify(skillIds) !== JSON.stringify(selectedSkills)) {
                        onSelectedSkillsChange(skillIds)
                      }
                    }
                  }}
                  onSubmit={() => {
                    if (!isLoading && (input?.trim() || imageAttachments.length > 0 || selectedSkills.length > 0)) {
                      const syntheticEvent = new Event('submit', {
                        bubbles: true,
                        cancelable: true,
                      }) as any
                      syntheticEvent.preventDefault = () => {}
                      enhancedHandleSubmit(syntheticEvent)
                    }
                  }}
                  className="min-h-[3rem]"
                />
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-between gap-x-2">
          <div className="flex items-center gap-x-2">
            <EditButton
              isLoading={isLoading}
              sandboxId={sandboxId}
              isHoverModeEnabled={isHoverModeEnabled}
              onToggleHoverMode={onToggleHoverMode}
            />
            <ClaudeModelSelector
              value={selectedModel}
              onChange={onModelChange}
              disabled={isLoading || isTranscribing}
              compact
            />
          </div>
          <div className="flex space-x-2">
            {/* Image attachment button */}
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || isUploadingImages}
              size="icon"
              variant="outline"
              className="rounded-xl h-10 w-10"
              title="Attach images"
            >
              {isUploadingImages ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <ImageIcon className="h-5 w-5" />
              )}
            </Button>
            {/* Voice recording button */}
            <Button
              type="button"
              onClick={toggleRecording}
              disabled={isTranscribing || (isLoading && useRealtimeVoice)}
              size="icon"
              variant={isRecording ? "destructive" : "outline"}
              className="rounded-xl h-10 w-10"
              title={
                isTranscribing
                  ? "Transcribing audio..."
                  : isRecording
                  ? "Stop recording"
                  : useRealtimeVoice
                  ? "Start live transcription (Deepgram)"
                  : "Record audio"
              }
            >
              {isTranscribing ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : isRecording ? (
                <MicOff className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </Button>
            <Button
              type="submit"
              disabled={isLoading || (!input?.trim() && imageAttachments.length === 0 && selectedSkills.length === 0)}
              size="icon"
              className="rounded-xl h-10 w-10"
            >
              <ArrowUp className="h-5 w-5" />
            </Button>
          </div>
        </div>
        {/* Cloud row - new bottom row */}
        <div className="relative flex items-center gap-x-2 bg-background border-t-1 -m-2 p-2 pl-2">
          {/* Invisible overlay when panel is open - clicking it dismisses the panel */}
          {isCloudPanelOpen && (
            <div
              className="absolute inset-0 z-10 cursor-pointer"
              onClick={onCloudPanelClose}
            />
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onCloudPanelOpen}
            className={cn(
              "flex-col items-center justify-center w-[95px] h-[50px]",
              cloudEnabled
                ? "bg-green-500/20 text-green-500 hover:bg-green-500/30 hover:text-green-400 border border-green-500/30"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Cloud className="h-5 w-5" />
            <span>Cloud</span>
          </Button>
        </div>
      </form>
    </div>
  )
})