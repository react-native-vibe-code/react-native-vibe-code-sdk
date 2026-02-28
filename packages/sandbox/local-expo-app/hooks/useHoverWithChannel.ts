import { useHoverSystem } from '@/features/element-edition/useHoverSystem'
import Pusher from 'pusher-js'
import { useState, useEffect } from 'react'

export const useHoverWithChannel = () => {
  const [isHoverEnabled, setIsHoverEnabled] = useState(false)

  // Get sandboxId from environment variable (set in .env.local by server-utils)
  // Note: URL query params are stripped by Expo Router v6 via history.replaceState
  const sandboxId =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('sandboxId') ||
        process.env.EXPO_PUBLIC_SANDBOX_ID
      : process.env.EXPO_PUBLIC_SANDBOX_ID

  // Listen for hover mode changes via Pusher
  useEffect(() => {
    console.log(
      '[useHoverWithChannel] Setting up Pusher listener, sandboxId:',
      sandboxId,
    )

    if (typeof window === 'undefined' || !sandboxId) {
      console.log(
        '[useHoverWithChannel] Skipping Pusher setup - no window or sandboxId',
      )
      return
    }

    try {
      console.log('[useHoverWithChannel] Initializing Pusher client...')
      // Initialize Pusher client
      const pusher = new Pusher(process.env.EXPO_PUBLIC_PUSHER_APP_KEY || '', {
        cluster: process.env.EXPO_PUBLIC_PUSHER_CLUSTER || 'us2',
      })

      // Log connection state changes
      pusher.connection.bind('state_change', (states: any) => {
        console.log(
          '[useHoverWithChannel] Pusher connection state changed:',
          states.previous,
          '->',
          states.current,
        )
      })

      // Subscribe to sandbox-specific channel
      const channelName = `sandbox-${sandboxId}`
      console.log(
        `[useHoverWithChannel] Subscribing to channel: ${channelName}`,
      )
      const channel = pusher.subscribe(channelName)

      // Listen for hover mode toggle events
      channel.bind('hover-mode-toggle', (data: { enabled: boolean }) => {
        console.log(
          '📡 [useHoverWithChannel] Received hover mode toggle event:',
          data,
        )
        console.log(
          '[useHoverWithChannel] Setting hover enabled to:',
          data.enabled,
        )
        setIsHoverEnabled(data.enabled)
      })

      channel.bind('pusher:subscription_succeeded', () => {
        console.log(
          `✅ [useHoverWithChannel] Successfully subscribed to Pusher channel: ${channelName}`,
        )
      })

      channel.bind('pusher:subscription_error', (error: any) => {
        console.error(
          `❌ [useHoverWithChannel] Failed to subscribe to channel ${channelName}:`,
          error,
        )
      })

      // Bind to all events for debugging
      channel.bind_global((eventName: string, data: any) => {
        console.log(
          `[useHoverWithChannel] Received Pusher event '${eventName}':`,
          data,
        )
      })

      return () => {
        console.log('[useHoverWithChannel] Cleaning up Pusher connection')
        channel.unbind_all()
        channel.unsubscribe()
        pusher.disconnect()
      }
    } catch (error) {
      console.error(
        '[useHoverWithChannel] Failed to initialize Pusher for hover mode:',
        error,
      )
    }
  }, [sandboxId])

  // Initialize hover system
  console.log(
    '[useHoverWithChannel] Initializing hover system with enabled:',
    isHoverEnabled,
  )
  const hoverSystem = useHoverSystem({
    enabled: isHoverEnabled,
    ...(typeof window !== 'undefined' && { sandboxId }),
  })

  return {
    ...hoverSystem,
    isHoverEnabled,
    sandboxId,
  }
}
