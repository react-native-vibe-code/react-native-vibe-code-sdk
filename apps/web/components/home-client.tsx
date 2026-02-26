'use client'

import { AuthDialog } from '@/components/auth-dialog'
import { ChatInput } from '@/components/chat-input'
import { ImageAttachment } from '@/components/chat-panel-input'
import { NavHeader } from '@/components/nav-header'
import { useToast } from '@/components/ui/use-toast'
import { useClaudeModel } from '@/hooks/use-claude-model'
import { useCookieStorage } from '@/hooks/useCookieStorage'
import { signOut } from '@/lib/auth/client'
import { LLMModelConfig } from '@/lib/models'
import modelsList from '@/lib/models.json'
import type { AISkill } from '@/lib/skills'
import { TemplateId } from '@/lib/templates'
import { useRouter, useSearchParams } from 'next/navigation'
import { usePostHog } from 'posthog-js/react'
import { SetStateAction, useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'

interface HomeClientProps {
  initialSession: any
}

export function HomeClient({ initialSession }: HomeClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  // Use cookie storage in development, useState in production
  const isDevelopment = process.env.NODE_ENV === 'development'

  // Always call both hooks, but only use the one we need
  const [chatInputCookie, setChatInputCookie] = useCookieStorage('chat', '')
  const [chatInputState, setChatInputState] = useState('')
  const chatInput = isDevelopment ? chatInputCookie : chatInputState
  const setChatInput = isDevelopment ? setChatInputCookie : setChatInputState

  const [files, setFiles] = useState<File[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<'auto' | TemplateId>(
    'react-native-expo',
  )
  const [isUploadingImages, setIsUploadingImages] = useState(false)
  const [selectedSkills, setSelectedSkills] = useState<AISkill[]>([])

  const [languageModelCookie, setLanguageModelCookie] =
    useCookieStorage<LLMModelConfig>('languageModel', {
      model: 'claude-3-5-sonnet-latest',
    })
  const [languageModelState, setLanguageModelState] = useState<LLMModelConfig>({
    model: 'claude-3-5-sonnet-latest',
  })
  const languageModel = isDevelopment ? languageModelCookie : languageModelState
  const setLanguageModel = isDevelopment
    ? setLanguageModelCookie
    : setLanguageModelState

  const posthog = usePostHog()
  const [isAuthDialogOpen, setAuthDialog] = useState(false)
  const { selectedModel, setSelectedModel } = useClaudeModel()

  // Handle checkout success/cancel
  useEffect(() => {
    const checkoutStatus = searchParams?.get('checkout')
    const customerSessionToken = searchParams?.get('customer_session_token')

    if (checkoutStatus === 'success') {
      toast({
        title: 'Subscription Successful!',
        description:
          'Your subscription has been activated. Thank you for subscribing!',
      })
      // Clean up URL parameters
      window.history.replaceState({}, document.title, '/')

      // If there's a customer session token, we could handle it here
      if (customerSessionToken) {
        // You could store this token or use it to fetch customer details
      }
    } else if (checkoutStatus === 'cancelled') {
      toast({
        title: 'Checkout Cancelled',
        description: 'Your subscription checkout was cancelled.',
        variant: 'destructive',
      })
      // Clean up URL parameters
      window.history.replaceState({}, document.title, '/')
    }
  }, [searchParams, toast])

  const filteredModels = modelsList.models.filter((model) => {
    if (process.env.NEXT_PUBLIC_HIDE_LOCAL_MODELS) {
      return model.providerId !== 'ollama'
    }
    return true
  })

  const currentModel = filteredModels.find(
    (model) => model.id === languageModel.model,
  )

  async function handleSubmitAuth(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!initialSession) {
      return setAuthDialog(true)
    }

    // Generate UUID and navigate to project page with first message
    const projectId = uuidv4()

    // Build query params including image attachments and skills if present
    const queryParams = new URLSearchParams({
      firstMessage: chatInput,
      template: selectedTemplate,
      model: selectedModel,
    })

    // Add skills to query params if any are selected
    if (selectedSkills.length > 0) {
      const skillIds = selectedSkills.map((skill) => skill.id)
      queryParams.set('skills', JSON.stringify(skillIds))
    }

    // Upload files and get URLs if any files exist
    if (files.length > 0) {
      try {
        setIsUploadingImages(true)
        console.log(
          '[HomeClient] Uploading',
          files.length,
          'images before navigation...',
        )

        // Upload each image to Vercel Blob
        const uploadPromises = files.map(async (file) => {
          const formData = new FormData()
          formData.append('file', file)

          const response = await fetch('/api/upload-image', {
            method: 'POST',
            body: formData,
          })

          if (!response.ok) {
            throw new Error(`Failed to upload ${file.name}`)
          }

          return (await response.json()) as ImageAttachment
        })

        const uploadedAttachments = await Promise.all(uploadPromises)
        const imageUrls = uploadedAttachments.map((a) => a.url)
        queryParams.set('imageUrls', JSON.stringify(imageUrls))
        console.log('[HomeClient] Uploaded image URLs:', imageUrls)
      } catch (error) {
        console.error('[HomeClient] Error uploading images:', error)
        toast({
          title: 'Upload Failed',
          description: 'Failed to upload one or more images. Please try again.',
          variant: 'destructive',
        })
        setIsUploadingImages(false)
        return
      } finally {
        setIsUploadingImages(false)
      }
    }

    router.push(`/p/${projectId}?${queryParams.toString()}`)

    posthog.capture('chat_submit', {
      template: selectedTemplate,
      model: languageModel.model,
      hasImages: files.length > 0,
      imageCount: files.length,
      hasSkills: selectedSkills.length > 0,
      skillCount: selectedSkills.length,
    })

    // Clear files and skills after navigation
    setFiles([])
    setSelectedSkills([])
  }

  function handleSaveInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setChatInput(e.target.value)
  }

  function handleFileChange(change: SetStateAction<File[]>) {
    setFiles(change)
  }

  async function logout() {
    const { error } = await signOut()
    if (!error) {
      // Session will be automatically cleared by better-auth
    }
  }

  function handleLanguageModelChange(e: LLMModelConfig) {
    setLanguageModel({ ...languageModel, ...e })
  }

  function handleSocialClick(target: 'github' | 'x' | 'discord') {
    if (target === 'github') {
      window.open(
        'https://github.com/react-native-vibe-code/react-native-vibe-code-sdk',
        '_blank',
      )
    } else if (target === 'x') {
      window.open('https://x.com/e2b_dev', '_blank')
    } else if (target === 'discord') {
      window.open('https://discord.gg/U7KEcGErtQ', '_blank')
    }

    posthog.capture(`${target}_click`)
  }

  return (
    <>
      <AuthDialog open={isAuthDialogOpen} setOpen={setAuthDialog} />
      <div className="grid w-full md:grid-cols-2">
        <div className="flex flex-col w-full max-h-full max-w-6xl mx-auto px-0 overflow-auto col-span-2">
          <NavHeader
            session={initialSession}
            showLogin={() => setAuthDialog(true)}
            signOut={logout}
            onSocialClick={handleSocialClick}
            onClear={() => {}}
            canClear={false}
            canUndo={false}
            onUndo={() => {}}
          />
          <div className={`flex flex-1 justify-center relative ${initialSession ? 'items-center' : 'items-start pt-[100px] md:pt-[200px]'}`}>
            <div className="text-center md:hidden p-4 md:p-0">
              {!initialSession && (
                <>
                  <h2 className="text-2xl md:text-5xl font-semibold mb-2 text-center leading-[35px] md:leading-[70px] whitespace-normal px-0 md:px-0">
                    The free and open source React Native vibe coding IDE
                  </h2>
                  <h2 className="text-2xl md:text-5xl font-semibold mb-2 text-center leading-[35px] md:leading-[70px] whitespace-normal px-0 md:px-0">
                    Text to mobile & web apps in seconds
                  </h2>
                  <p className="text-muted-foreground mb-4 text-center text-md md:text-md px-0 md:px-0">
                    Ask chat anything, and turn your words into iOS, Android and
                    web apps at the same time.
                  </p>
                </>
              )}
              <ChatInput
                hideHoverModeToggle
                retry={() => {}}
                isErrored={false}
                errorMessage=""
                isLoading={false}
                isRateLimited={false}
                stop={() => {}}
                input={chatInput}
                handleInputChange={handleSaveInputChange}
                handleSubmit={handleSubmitAuth}
                isMultiModal={currentModel?.multiModal || false}
                files={files}
                handleFileChange={handleFileChange}
                disabled={false}
                isAuthenticated={!!initialSession}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                onSkillsChange={setSelectedSkills}
              />
            </div>
            <div className="text-center hidden md:block container">
              {!initialSession && (
                <>
                  <h2 className="w-full m-auto text-xl md:text-3xl font-semibold mb-2 leading-[45px] md:leading-[45px] px-4 pb-0 md:px-0 animate-fade-in-up animation-delay-300">
                    The free and open source React Native vibe coding IDE
                  </h2>
                  <h2 className="w-full m-auto text-xl md:text-3xl font-semibold mb-2 leading-[45px] md:leading-[45px] px-4 pb-0 md:px-0 animate-fade-in-up animation-delay-300">
                    Text to mobile apps in seconds
                  </h2>
                  <p className="text-muted-foreground mb-4 text-center text-lg md:text-md px-4 md:px-0 animate-fade-in-up animation-delay-600 mb-12">
                    Ask chat anything, and turn your words into iOS, Android and
                    web apps at the same time.
                  </p>
                </>
              )}
              <ChatInput
                hideHoverModeToggle
                retry={() => {}}
                isErrored={false}
                errorMessage=""
                isLoading={false}
                isRateLimited={false}
                stop={() => {}}
                input={chatInput}
                handleInputChange={handleSaveInputChange}
                handleSubmit={handleSubmitAuth}
                isMultiModal={currentModel?.multiModal || false}
                files={files}
                handleFileChange={handleFileChange}
                disabled={false}
                isAuthenticated={!!initialSession}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                onSkillsChange={setSelectedSkills}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
