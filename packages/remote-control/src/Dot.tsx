import React, { useState } from 'react'
import { Platform } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { DotProvider } from './DotContext'
import { DotModal } from './DotModal'
import { DraggableFloatingButton } from './DraggableFloatingButton'
import type { ImageSource } from 'expo-image'

import './polyfills'

export interface DotProps {
  projectId: string
  apiBaseUrl: string
  children: React.ReactNode
  buttonSize?: number
  buttonImage?: ImageSource
}

export function Dot({
  projectId,
  apiBaseUrl,
  children,
  buttonSize,
  buttonImage,
}: DotProps) {
  const [isModalVisible, setIsModalVisible] = useState(false)

  return (
    <DotProvider projectId={projectId} apiBaseUrl={apiBaseUrl}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {children}
        <DraggableFloatingButton
          onPress={() => setIsModalVisible(true)}
          buttonSize={buttonSize}
          buttonImage={buttonImage}
        />
        <DotModal
          visible={isModalVisible}
          onClose={() => setIsModalVisible(false)}
        />
      </GestureHandlerRootView>
    </DotProvider>
  )
}
