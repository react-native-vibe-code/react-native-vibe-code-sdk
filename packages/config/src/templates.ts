import type { Templates, TemplateConfig } from '@react-native-vibe-code/types'

const templates: Templates = {
  'react-native-expo': {
    name: 'React Native Expo',
    lib: ['react-native', 'expo'],
    file: 'App.tsx',
    instructions: 'A React Native Expo app that reloads automatically.',
    port: 8081,
  },
  'expo-testing': {
    name: 'Expo Testing',
    lib: ['react-native', 'expo'],
    file: 'App.tsx',
    instructions: 'A React Native Expo app that reloads automatically.',
    port: 8081,
  },
}

export default templates
export type { Templates, TemplateConfig }
export type TemplateId = keyof typeof templates

export function templatesToPrompt(templates: Templates): string {
  return `${Object.entries(templates)
    .map(
      ([id, t], index) =>
        `${index + 1}. ${id}: "${t.instructions}". File: ${t.file || 'none'}. Dependencies installed: ${t.lib.join(', ')}. Port: ${t.port || 'none'}.`
    )
    .join('\n')}`
}
