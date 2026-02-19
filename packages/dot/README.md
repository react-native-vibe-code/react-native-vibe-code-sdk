# @react-native-vibe-code/dot

A floating AI chat bubble for [React Native Vibe Code](https://www.reactnativevibecode.com) — vibe code your Expo app in real time.

## What is this?

**Dot** is a drop-in React Native component that adds a draggable floating button to your app. Tap it to open a chat interface powered by Claude AI that can read and modify your project's code while you see changes live in Expo Go.

It's the same AI coding experience from [reactnativevibecode.com](https://www.reactnativevibecode.com), embedded directly in your running app.

## Install

```bash
npx expo install @react-native-vibe-code/dot
```

Peer dependencies (most Expo apps already have these):

```bash
npx expo install react-native-gesture-handler react-native-reanimated expo-image @ai-sdk/react lucide-react-native @react-native-async-storage/async-storage
```

## Usage

Wrap your root layout with `<Dot>`:

```tsx
import { Dot } from '@react-native-vibe-code/dot'
import { Stack } from 'expo-router'

export default function RootLayout() {
  return (
    <Dot
      projectId={process.env.EXPO_PUBLIC_PROJECT_ID!}
      apiBaseUrl="https://www.reactnativevibecode.com"
    >
      <Stack screenOptions={{ headerShown: false }} />
    </Dot>
  )
}
```

A floating button appears in the corner of your app. Drag it anywhere, tap to open the chat, and describe the changes you want — the AI modifies your code and you see updates live.

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `projectId` | `string` | Yes | Your project ID from reactnativevibecode.com |
| `apiBaseUrl` | `string` | Yes | API URL (e.g. `https://www.reactnativevibecode.com`) |
| `children` | `ReactNode` | Yes | Your app content |
| `buttonSize` | `number` | No | Floating button diameter (default: 50) |
| `buttonImage` | `ImageSource` | No | Custom button image (default: star icon) |

## How it works

1. You build your app on [reactnativevibecode.com](https://www.reactnativevibecode.com)
2. Your exported app includes `<Dot>` with your project ID
3. Open the app in Expo Go — the floating button appears
4. Tap the button, describe what you want to change
5. Claude AI modifies your code and the app updates live

## License

MIT
