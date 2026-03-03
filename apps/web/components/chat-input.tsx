'use client'

import { RepoBanner } from './repo-banner'
import { Button } from '@/components/ui/button'
import { ClaudeModelSelector } from '@/components/claude-model-selector'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn, isFileInArray } from '@/lib/utils'
import { ArrowUp, Paperclip, Square, X, MousePointerClick, Mic, MicOff, Image as ImageIcon } from 'lucide-react'
import { SetStateAction, useEffect, useMemo, useState, useRef } from 'react'
import TextareaAutosize from 'react-textarea-autosize'
import { useAudioRecorder } from '@/hooks/use-audio-recorder'
import ReactPlaceholderTyping from 'react-placeholder-typing'
import { ChatEditor, type ChatEditorRef } from '@/components/tiptap/chat-editor'
import type { AISkill } from '@/lib/skills'
import '@/components/tiptap/chat-editor.css'

interface ChatRequestOptions {
  body?: Record<string, unknown>
  data?: Record<string, unknown>
}


export function ChatInput({
  retry,
  isErrored,
  errorMessage,
  isLoading,
  isRateLimited,
  stop,
  input,
  handleInputChange,
  handleSubmit,
  isMultiModal,
  files,
  handleFileChange,
  hideHoverModeToggle,
  disabled = false,
  isAuthenticated = false,
  selectedModel,
  onModelChange,
  onSkillsChange,
  suggestionTip,
}: {
  retry: () => void
  isErrored: boolean
  errorMessage: string
  isLoading: boolean
  isRateLimited: boolean
  stop: () => void
  input: string
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleSubmit: (e: React.FormEvent<HTMLFormElement>, options?: ChatRequestOptions) => void
  isMultiModal: boolean
  files: File[]
  handleFileChange: (change: SetStateAction<File[]>) => void
  hideHoverModeToggle: boolean
  disabled?: boolean
  isAuthenticated?: boolean
  selectedModel: string
  onModelChange: (modelId: string) => void
  onSkillsChange?: (skills: AISkill[]) => void
  suggestionTip?: string
}) {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const baseInputRef = useRef<string>('')
  const recordSoundRef = useRef<HTMLAudioElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [textareaWidth, setTextareaWidth] = useState<number>(0)
  const editorRef = useRef<ChatEditorRef>(null)
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const [selectedSkills, setSelectedSkills] = useState<AISkill[]>([])
  const [editorWidth, setEditorWidth] = useState<number>(0)

  // Sync external input changes (e.g. from query params) into the TipTap editor
  useEffect(() => {
    if (input && editorRef.current) {
      const currentText = editorRef.current.getPlainText?.() || ''
      if (!currentText.trim() && input.trim()) {
        editorRef.current.setContent(input)
      }
    }
  }, [input])

  // Audio recorder for Whisper transcription
  const audioRecorder = useAudioRecorder()

  // Check if realtime voice is enabled (we'll use Whisper by default for home page)
  const useRealtimeVoice = process.env.NEXT_PUBLIC_REALTIME_VOICE === 'true'

  // Handle editor content changes
  const handleEditorContentChange = (text: string, skills: AISkill[]) => {
    setSelectedSkills(skills)
    onSkillsChange?.(skills)
    // Simulate a textarea change event for compatibility
    const event = {
      target: { value: text },
    } as React.ChangeEvent<HTMLTextAreaElement>
    handleInputChange(event)
  }

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

  const toggleRecording = async () => {
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
              // Append transcription to editor
              const fullText = baseInputRef.current + (baseInputRef.current ? ' ' : '') + transcription
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

  // Preload the recording sound
  useEffect(() => {
    const audio = new Audio('https://etq42zw2k4.ufs.sh/f/Ygf2KSyPE9xcc8MKS2xOv0clTFLAMPxRXIetKY3VjanB6wEr')
    audio.volume = 0.5
    audio.preload = 'auto'
    recordSoundRef.current = audio

    audio.load()
  }, [])

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    handleFileChange((prev) => {
      const newFiles = Array.from(e.target.files || [])
      const uniqueFiles = newFiles.filter((file) => !isFileInArray(file, prev))
      return [...prev, ...uniqueFiles]
    })
  }

  function handleFileRemove(file: File) {
    handleFileChange((prev) => prev.filter((f) => f !== file))
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items)

    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault()

        const file = item.getAsFile()
        if (file) {
          handleFileChange((prev) => {
            if (!isFileInArray(file, prev)) {
              return [...prev, file]
            }
            return prev
          })
        }
      }
    }
  }

  const [dragActive, setDragActive] = useState(false)

  function handleDrag(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const droppedFiles = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.startsWith('image/'),
    )

    if (droppedFiles.length > 0) {
      handleFileChange((prev) => {
        const uniqueFiles = droppedFiles.filter(
          (file) => !isFileInArray(file, prev),
        )
        return [...prev, ...uniqueFiles]
      })
    }
  }

  const filePreview = useMemo(() => {
    if (files.length === 0) return null
    return Array.from(files).map((file) => {
      return (
        <div className="relative" key={file.name}>
          <span
            onClick={() => handleFileRemove(file)}
            className="absolute top-[-8] right-[-8] bg-muted rounded-full p-1"
          >
            <X className="h-3 w-3 cursor-pointer" />
          </span>
          <img
            src={URL.createObjectURL(file)}
            alt={file.name}
            className="rounded-xl w-10 h-10 object-cover"
          />
        </div>
      )
    })
  }, [files])

  // Enhanced submit handler that includes skills
  const enhancedHandleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    // Build options for handleSubmit
    const options: ChatRequestOptions = {}

    // Pass selected skills via body
    if (selectedSkills.length > 0) {
      options.body = {
        skills: selectedSkills.map(skill => skill.id),
      }
    }

    // Pass options through handleSubmit's second parameter
    handleSubmit(e, Object.keys(options).length > 0 ? options : undefined)

    // Note: Don't clear skills here - let the parent component decide when to clear them
    // On home page, skills are passed via URL query params during navigation
    // On project page, skills are cleared after message is sent in chat-panel-input
  }

  const handleEditorSubmit = () => {
    if (input.trim()) {
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true }) as any
      submitEvent.preventDefault = () => {}
      enhancedHandleSubmit(submitEvent as React.FormEvent<HTMLFormElement>)
    }
  }

  useEffect(() => {
    if (!isMultiModal) {
      handleFileChange([])
    }
  }, [isMultiModal])

  // Capture editor width for placeholder animation
  useEffect(() => {
    const updateWidth = () => {
      if (editorContainerRef.current) {
        setEditorWidth(editorContainerRef.current.offsetWidth)
      }
    }

    updateWidth()
    window.addEventListener('resize', updateWidth)

    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  return (
    <form
      onSubmit={enhancedHandleSubmit}
      className="mb-2 mt-auto flex flex-col bg-background max-w-[755px] mx-auto"
      onDragEnter={isMultiModal ? handleDrag : undefined}
      onDragLeave={isMultiModal ? handleDrag : undefined}
      onDragOver={isMultiModal ? handleDrag : undefined}
      onDrop={isMultiModal ? handleDrop : undefined}
    >
      {suggestionTip && (
        <div className="flex items-center py-3 text-sm  mb-4 rounded-xl bg-muted/50 text-muted-foreground border border-border/50">
          <span className="flex-1">
            On chat input type <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono bg-gray-600 text-bold text-white">/</code> to select the <strong>{suggestionTip}</strong> integration
          </span>
        </div>
      )}
      {isErrored && (
        <div
          className={`flex items-center p-1.5 text-sm font-medium mx-4 mb-10 rounded-xl ${
            isRateLimited
              ? 'bg-orange-400/10 text-orange-400'
              : 'bg-red-400/10 text-red-400'
          }`}
        >
          <span className="flex-1 px-1.5">{errorMessage}</span>
          <button
            className={`px-2 py-1 rounded-sm ${
              isRateLimited ? 'bg-orange-400/20' : 'bg-red-400/20'
            }`}
            onClick={retry}
          >
            Try again
          </button>
        </div>
      )}
      <div className="relative">
        <div
          className={`shadow-md rounded-2xl relative z-10 bg-background border  pt-2 mb-4 ${
            dragActive
              ? 'before:absolute before:inset-0 before:rounded-2xl before:border-2 before:border-dashed before:border-primary'
              : ''
          }`}
        >
          {/* Image previews */}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pb-2">
              {filePreview}
            </div>
          )}
          <div className="relative px-3 pt-2" ref={editorContainerRef}>
            {!input && editorWidth > 0 && (
              <div className="absolute top-0 left-0 pointer-events-none z-0 px-3 pt-2">
                <div className="absolute -right-[-8px] w-[10px] h-[23px] bg-white dark:bg-primary-foreground"/>
                <ReactPlaceholderTyping
                  placeholders={["describe any type of app idea you have...               ", "create that app you always thought of...                "]}
                  containerStyle={{border: 'none', background: 'transparent', padding: 0}}
                  inputStyle={{
                    width: editorWidth - 24,
                    fontSize: 'inherit',
                    fontFamily: 'inherit',
                    lineHeight: 'inherit',
                    color: 'hsl(var(--muted-foreground))',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    padding: 0,
                    margin: 0,
                  }}
                  speed={50}
                />
              </div>
            )}
            <ChatEditor
              ref={editorRef}
              placeholder={
                isRecording
                  ? 'Recording...'
                  : isTranscribing
                  ? 'Transcribing...'
                  : ''
              }
              disabled={isErrored || disabled}
              onContentChange={handleEditorContentChange}
              onSubmit={handleEditorSubmit}
              disableEnterSubmit={true}
              className="min-h-[3rem] w-full relative z-10"
            />
          </div>
          <div className="flex p-3 gap-2 items-center justify-between">
            <input
              type="file"
              id="multimodal"
              name="multimodal"
              accept="image/*"
              multiple={true}
              className="hidden"
              onChange={handleFileInput}
            />

            <div className="flex items-center gap-2 ">
              {/* <TooltipProvider>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Button
                      hidden={hideHoverModeToggle}
                      disabled={isErrored}
                      type="button"
                      variant="outline"
                      size="icon"
                      className={cn(
                        'rounded-xl h-10 w-10',
                        hideHoverModeToggle && 'invisible',
                      )}
                      onClick={(e) => {
                        e.preventDefault()
                        // Add your click handler here
                      }}
                    >
                      <MousePointerClick className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Click action</TooltipContent>
                </Tooltip>
              </TooltipProvider> */}

              <ClaudeModelSelector
                value={selectedModel}
                onChange={onModelChange}
                disabled={isLoading || isErrored}
                compact
              />
            </div>

            <div className="flex gap-2">
              {/* Image upload button */}
              {isMultiModal && (
                <TooltipProvider>
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="rounded-xl h-10 w-10"
                        disabled={isLoading || isErrored}
                        onClick={() => document.getElementById('multimodal')?.click()}
                      >
                        <ImageIcon className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Attach images</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {/* Voice recording button - only show when authenticated */}
              {isAuthenticated && (
                <TooltipProvider>
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        onClick={toggleRecording}
                        disabled={isTranscribing || isLoading}
                        size="icon"
                        variant={isRecording ? "destructive" : "outline"}
                        className="rounded-xl h-10 w-10"
                      >
                        {isTranscribing ? (
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : isRecording ? (
                          <MicOff className="h-5 w-5" />
                        ) : (
                          <Mic className="h-5 w-5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isTranscribing
                        ? "Transcribing audio..."
                        : isRecording
                        ? "Stop recording"
                        : "Record audio"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {!isLoading ? (
                <TooltipProvider>
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <Button
                        disabled={isErrored || disabled}
                        variant="default"
                        size="icon"
                        type="submit"
                        className="rounded-xl h-10 w-10"
                      >
                        <ArrowUp className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Send message</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <TooltipProvider>
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="rounded-xl h-10 w-10"
                        onClick={(e) => {
                          e.preventDefault()
                          stop()
                        }}
                      >
                        <Square className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Stop generation</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        </div>
      </div>
    </form>
  )
}
