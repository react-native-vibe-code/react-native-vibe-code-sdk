'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { type ThemeProviderProps } from 'next-themes/dist/types'
import posthog from 'posthog-js'
import { PostHogProvider as PostHogProviderJS } from 'posthog-js/react'
import { DeepgramContextProvider } from '@/context/deepgram-context'
import { MicrophoneContextProvider } from '@/context/microphone-context'
import { KeyboardShortcutsProvider } from '@/context/keyboard-shortcuts-context'
import { ViewModeProvider } from '@/context/view-mode-context'
import { DevModeProvider } from '@/context/dev-mode-context'
import { GlobalCommandPalette } from '@/components/global-command-palette'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return <PostHogProviderJS client={posthog}>{children}</PostHogProviderJS>
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  // Create QueryClient instance per component to avoid sharing state between requests
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000, // Data is fresh for 30 seconds
        refetchOnWindowFocus: true, // Refetch when tab is focused
        refetchOnReconnect: true,
        retry: 1,
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      <NextThemesProvider {...props}>
        <DevModeProvider>
          <MicrophoneContextProvider>
            <DeepgramContextProvider>
              <KeyboardShortcutsProvider>
                <ViewModeProvider>
                  <GlobalCommandPalette />
                  {children}
                </ViewModeProvider>
              </KeyboardShortcutsProvider>
            </DeepgramContextProvider>
          </MicrophoneContextProvider>
        </DevModeProvider>
      </NextThemesProvider>
    </QueryClientProvider>
  )
}
