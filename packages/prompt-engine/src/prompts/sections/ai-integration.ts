import type { PromptSection } from "../../types";

export function createAiIntegrationSection(prodUrl: string): PromptSection {
  return {
    id: "ai-integration",
    name: "AI Integration",
    xmlTag: "using_ai",
    required: false,
    order: 12,
    content: `<using_ai>
  You can build app that use AI.

  Api route to make a request to AI: ${prodUrl}/api/toolkit/llm
  It is a POST route that accepts a JSON body with a messages array.
  It returns a JSON object: { completion: string }
  Messages are in the Vercel AI SDK format (@ai-sdk in npm), including images.
  Under the hood it just passes messages to generateText.

  Use these TypeScript types for references:
      type ContentPart =
  | { type: 'text'; text: string; }
  | { type: 'image'; image: string // base64; }

  type CoreMessage =
  | { role: 'system'; content: string; }
  | { role: 'user'; content: string | Array<ContentPart>; }
  | { role: 'assistant'; content: string | Array<ContentPart>; };

  Api route to generate images: ${prodUrl}/api/toolkit/images
  It is a POST route that accepts a JSON body with { prompt: string, size?: string }.
  size is optional, for example "1024x1024" or "512x512".
  It returns a JSON object: { image: { base64Data: string; mimeType: string; }, size: string }
  Uses DALL-E 3.

  Use these TypeScript types for references:
  type ImageGenerateRequest = { prompt: string, size?: string }
  type ImageGenerateResponse = { image: { base64Data: string; mimeType: string; }, size: string }

  Api route for speech-to-text: ${prodUrl}/api/toolkit/stt
  - It is a POST route that accepts FormData with audio file and optional language.
  - It returns a JSON object: { text: string, language: string }
  - Supports mp3, mp4, mpeg, mpga, m4a, wav, and webm audio formats and auto-language detection.
  - When using FormData for file uploads, never manually set the Content-Type header - let the browser handle it automatically.
  - After stopping recording: Mobile - disable recording mode with Audio.setAudioModeAsync({ allowsRecordingIOS: false }). Web - stop all stream tracks with stream.getTracks().forEach(track => track.stop())
  - Note: For Platform.OS === 'web', use Web Audio API (MediaRecorder) for audio recording. For mobile, use expo-av.

  When using expo-av for audio recording, always configure the recording format to output .wav for IOS and .m4a for Android by adding these options to prepareToRecordAsync().
  Here's an example of how to configure the recording format:
  <example>
    await recording.prepareToRecordAsync({
      android: {
        extension: '.m4a',
        outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_MPEG_4,
        audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_AAC,
      },
      ios: {
        extension: '.wav',
        outputFormat: Audio.RECORDING_OPTION_IOS_OUTPUT_FORMAT_LINEARPCM,
        audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_HIGH,
      },
    });
  </example>

  ALWAYS append audio to formData as { uri, name, type } for IOS/Android before sending it to the speech-to-text API.
  Here's an example of how to append the audio to formData:
  <example>
    const uri = recording.getURI();
    const uriParts = uri.split('.');
    const fileType = uriParts[uriParts.length - 1];

    const audioFile = {
      uri,
      name: "recording." + fileType,
      type: "audio/" + fileType
    };

    formData.append('audio', audioFile);
  </example>

  Use these TypeScript types for references:
  type STTRequest = { audio: File, language?: string }
  type STTResponse = { text: string, language: string }

  Handle errors and set proper state after the request is done.
</using_ai>`,
  };
}

export const aiIntegrationSection = createAiIntegrationSection(
  "https://reactnativevibecode.com"
);
