import { generateObject } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'

const TweetClassificationSchema = z.object({
  isAppRequest: z
    .boolean()
    .describe('Whether this tweet is requesting to build/create a mobile app'),
  appDescription: z
    .string()
    .optional()
    .describe(
      'If isAppRequest is true, a clean description of what app the user wants built'
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Confidence score from 0 to 1 for the classification'),
  reasoning: z
    .string()
    .optional()
    .describe('Brief explanation of why this was classified as such'),
})

export type TweetClassification = z.infer<typeof TweetClassificationSchema>

/**
 * Classify if a tweet is requesting to build an app or just a regular mention
 *
 * @param tweetText - The text content of the tweet
 * @param hasImages - Whether the tweet includes images
 * @param authorUsername - The Twitter username of the author
 * @returns Classification result with isAppRequest flag and optional app description
 */
export async function classifyTweet(
  tweetText: string,
  hasImages: boolean,
  authorUsername?: string
): Promise<TweetClassification> {
  try {
    const anthropic = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })

    const result = await generateObject({
      model: anthropic('claude-3-5-haiku-20241022'),
      schema: TweetClassificationSchema,
      prompt: `Analyze this tweet and determine if it's requesting to build/create a mobile app.

Tweet: "${tweetText}"
Has images attached: ${hasImages}
${authorUsername ? `Author: @${authorUsername}` : ''}

Classification rules:
1. An APP REQUEST typically:
   - Contains words like "build", "create", "make", "generate", "design" combined with "app"
   - Describes an app idea, feature, or functionality
   - Asks for help building something
   - Includes a design mockup or screenshot with the intent to create it
   - Requests a specific type of application (e.g., "build me a todo app")

2. A REGULAR MENTION (not an app request) typically:
   - Is just saying hello or asking a general question
   - Is asking about the platform's features or pricing
   - Is providing feedback or reporting issues
   - Is thanking or commenting without an app request
   - Is spam or unrelated content

If this IS an app request, extract a clean app description that can be used as a prompt for the AI to build the app. Focus on what the user wants to build, not the conversational parts of the tweet.

Be strict - only classify as an app request if there's clear intent to build something.`,
      maxTokens: 500,
      temperature: 0.3, // Lower temperature for more consistent classification
    })

    return result.object
  } catch (error) {
    console.error('Error classifying tweet:', error)
    // Default to not an app request on error to avoid false positives
    return {
      isAppRequest: false,
      confidence: 0,
      reasoning: 'Error during classification',
    }
  }
}

/**
 * Quick check if tweet likely contains app request keywords
 * Used as a pre-filter before AI classification to save API calls
 */
export function quickAppRequestCheck(tweetText: string): boolean {
  const lowerText = tweetText.toLowerCase()

  // Keywords that suggest app creation intent
  const buildKeywords = ['build', 'create', 'make', 'generate', 'design', 'develop']
  const appKeywords = ['app', 'application', 'mobile', 'ios', 'android', 'react native']

  const hasBuildKeyword = buildKeywords.some((kw) => lowerText.includes(kw))
  const hasAppKeyword = appKeywords.some((kw) => lowerText.includes(kw))

  // Also check for common app request phrases
  const appRequestPhrases = [
    'can you build',
    'can you make',
    'can you create',
    'help me build',
    'help me create',
    'i want an app',
    'i need an app',
    'build me',
    'create me',
    'make me',
  ]

  const hasAppRequestPhrase = appRequestPhrases.some((phrase) =>
    lowerText.includes(phrase)
  )

  return (hasBuildKeyword && hasAppKeyword) || hasAppRequestPhrase
}
