import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native'
import { type FC, useCallback, useMemo } from 'react'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated'
import { Image } from 'expo-image'
import { snapToCorner, useInitialPanelPosition } from './utils/animation-helpers'

import type { WithSpringConfig } from 'react-native-reanimated'
import type { ImageSource } from 'expo-image'

type DraggableFloatingButtonProps = {
  onPress: () => void
  buttonSize?: number
  buttonImage?: ImageSource
  springConfig?: WithSpringConfig
}

export const DraggableFloatingButton: FC<DraggableFloatingButtonProps> = ({
  onPress,
  buttonSize = 50,
  buttonImage,
  springConfig = {
    damping: 25,
    stiffness: 250,
    mass: 1,
  },
}) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions()
  const initialPosition = useInitialPanelPosition(buttonSize, buttonSize)

  const translateX = useSharedValue(initialPosition.x)
  const translateY = useSharedValue(initialPosition.y)
  const startX = useSharedValue(0)
  const startY = useSharedValue(0)
  const hasMoved = useSharedValue(false)

  const handlePress = useCallback(() => {
    'worklet'
    runOnJS(onPress)()
  }, [onPress])

  const panGesture = useMemo(() => {
    return Gesture.Pan()
      .minDistance(5)
      .onBegin(() => {
        hasMoved.set(false)
        startX.set(translateX.get())
        startY.set(translateY.get())
      })
      .onChange(event => {
        hasMoved.set(true)
        translateX.set(startX.get() + event.translationX)
        translateY.set(startY.get() + event.translationY)
      })
      .onEnd(event => {
        const snapPosition = snapToCorner(
          translateX.get(),
          translateY.get(),
          buttonSize,
          buttonSize,
          screenWidth,
          screenHeight,
        )

        translateX.set(
          withSpring(snapPosition.x, {
            ...springConfig,
            velocity: event.velocityX,
          }),
        )
        translateY.set(
          withSpring(snapPosition.y, {
            ...springConfig,
            velocity: event.velocityY,
          }),
        )
      })
  }, [
    hasMoved,
    startX,
    translateX,
    startY,
    translateY,
    buttonSize,
    screenWidth,
    screenHeight,
    springConfig,
  ])

  const tapGesture = useMemo(() => {
    return Gesture.Tap().onEnd(() => {
      handlePress()
    })
  }, [handlePress])

  const composedGesture = Gesture.Exclusive(panGesture, tapGesture)

  const buttonStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.get() },
        { translateY: translateY.get() },
      ],
    }
  })

  if(Platform.OS === "web") return null

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[styles.floatingButton, buttonStyle]}>
        <View style={[styles.circle, { width: buttonSize, height: buttonSize, borderRadius: buttonSize / 2, justifyContent: 'center', alignItems: 'center' }]}>
          <Image
            source={buttonImage ?? require('../assets/star.png')}
            style={{ width: buttonSize - 12, height: buttonSize - 12, borderRadius: buttonSize / 2 }}
            contentFit="cover"
          />
        </View>
      </Animated.View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  floatingButton: {
    position: 'absolute',
    zIndex: 999,
  },
  circle: {
    backgroundColor: 'black',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
})
