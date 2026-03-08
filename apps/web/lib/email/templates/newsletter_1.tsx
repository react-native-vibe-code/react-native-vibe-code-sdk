import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface NewsletterUpdate {
  title: string
  description: string
  linkUrl?: string
  linkText?: string
}

interface NewsletterEmailProps {
  previewText?: string
  issueNumber?: number
  issueDate?: string
  heading?: string
  intro?: string
  updates?: NewsletterUpdate[]
  closingTitle?: string
  closingText?: string
  ctaText?: string
  ctaUrl?: string
  unsubscribeUrl?: string
}

export default function NewsletterEmail({
  previewText = "What's new at React Native Vibe Code",
  issueNumber = 1,
  issueDate = 'March 2026',
  heading = "What's New at React Native Vibe Code",
  intro = "Hey everyone 👋. It's been 3 weeks since the release of React Native Vibe Code. The feedback has been very positive and overwelming. More that 500 users and thousands of apps created already. That is great but we got a lot of feedback on bugs, and half baked features. It happens, we just released but fixes are already live. Here's what we've been working on to make your vibe coding experience even better.",
  updates = defaultUpdates,
  closingTitle = 'Try It Out',
  closingText = 'All of these improvements are live right now. Jump in and start building.',
  ctaText = 'Open React Native Vibe Code',
  ctaUrl = 'https://www.reactnativevibecode.com',
  unsubscribeUrl,
}: NewsletterEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={headerSection}>
            <Text style={headerBrand}>REACT NATIVE VIBE CODE</Text>
            <Text style={headerSubtitle}>
              Issue #{issueNumber} &middot; {issueDate}
            </Text>
          </Section>

          <Heading style={h1}>{heading}</Heading>

          <Text style={text}>{intro}</Text>

          <Hr style={hr} />

          {/* Updates */}
          {updates.map((update, i) => (
            <Section key={i} style={updateSection}>
              <Heading as="h2" style={h2}>
                {update.title}
              </Heading>
              <Text style={updateText}>{update.description}</Text>
              {update.linkUrl && (
                <Link href={update.linkUrl} style={updateLink}>
                  → {update.linkText || 'Learn more'}
                </Link>
              )}
            </Section>
          ))}

          <Hr style={hr} />

          {/* What's Next */}
          <Heading as="h2" style={h2}>
            What's Next
          </Heading>
          <Heading as="h3" style={h3}>
            Introducing Open Code — A New Code Agent
          </Heading>
          <Text style={updateText}>
            OpenCode is one of the most popular code agents available today, and
            we're bringing it to React Native Vibe Code. Its power comes from
            supporting many providers and models—Codex, Gemini, Kiwi, and more.
            This means you'll be able to choose the model that works best for
            your project, easily double the value of your credits, and get the
            most out of your subscription. Rolling out soon.
          </Text>

          <Hr style={hr} />

          {/* Closing */}
          <Heading as="h2" style={h2}>
            {closingTitle}
          </Heading>
          <Text style={text}>{closingText}</Text>

          <Section style={buttonSection}>
            <Button style={button} href={ctaUrl}>
              {ctaText}
            </Button>
          </Section>

          <Hr style={hr} />

          {/* Footer */}
          <Text style={footer}>
            You're receiving this because you signed up for{' '}
            <Link
              target="_blank"
              href="https://reactnativevibecode.com"
              style={link}
            >
              React Native Vibe Code
            </Link>
            .
          </Text>
          <Text style={footer}>
            <Link
              href="https://reactnativevibecode.com"
              target="_blank"
              style={link}
            >
              React Native Vibe Code
            </Link>{' '}
            - Text to mobile & web apps in seconds
          </Text>
          {unsubscribeUrl && (
            <Text style={footer}>
              <Link href={unsubscribeUrl} style={link}>
                Unsubscribe
              </Link>{' '}
              from future emails
            </Text>
          )}
        </Container>
      </Body>
    </Html>
  )
}

// ── Default sample content ─────────────────────────────────────────────

const defaultUpdates: NewsletterUpdate[] = [
  {
    title: 'Streaming is Fixed',
    description:
      "We fixed a peristent bug on our streaming pipeline that would not send the last messages of the agent code generation to the chat panel. Code generation now flows smoothly in real-time with no more hanging, stalling, or partial streamings. The experience now feels instant—you'll see your app come together line by line without interruption.",
  },
  {
    title: 'Expo Ngrok Server Stability',
    description:
      "Live preview is now rock-solid. We overhauled how we handle Expo's tunnel connections so your app preview stays connected and responsive. No more random disconnects or \"tunnel not found\" errors—a much more reliable live preview. More work to be done here, but much better overall experience now.",
  },
  {
    title: 'Error Manager Library — Released & Fixed',
    description:
      "We built and released the error-manager package. It automatically detects Expo errors, extracts full error context with source and stack traces, and surfaces them as clean notification cards right above your chat input. No more digging through logs—errors are caught and shown to you instantly so the AI can fix them.",
    linkUrl: 'https://www.youtube.com/watch?v=6GQOgzDrqHA',
    linkText: 'Watch the release video',
  },
  {
    title: 'Visual Edits — Point, Prompt, Done',
    description:
      "We fixed and improved visual edits. Now you can select any visual element directly from your app preview and prompt for changes to it. No more writing long prompts describing where you want the change—just tap the element, say what to change, and it's done. Faster iteration, less guesswork.",
    linkUrl: 'https://www.youtube.com/watch?v=7xwdsotl2uo',
    linkText: 'Watch the release video',
  },
  {
    title: 'Prices Cut in Half',
    description:
      "We dropped our prices across the board. The Start plan now begins at just $9.99/month—half of what it was. We believe everyone should be able to vibe code their ideas into real apps without breaking the bank. Same powerful AI, way more accessible.",
  },
]

// ── Styles ─────────────────────────────────────────────────────────────

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '40px 20px',
  maxWidth: '560px',
  borderRadius: '8px',
}

const headerSection = {
  textAlign: 'center' as const,
  marginBottom: '24px',
}

const headerBrand = {
  fontSize: '14px',
  fontWeight: '700',
  letterSpacing: '3px',
  color: '#000000',
  margin: '0',
}

const headerSubtitle = {
  fontSize: '13px',
  color: '#8898aa',
  margin: '4px 0 0',
}

const h1 = {
  color: '#1a1a1a',
  fontSize: '26px',
  fontWeight: '700',
  margin: '0 0 16px',
  padding: '0',
  textAlign: 'center' as const,
}

const h2 = {
  color: '#1a1a1a',
  fontSize: '18px',
  fontWeight: '600',
  margin: '0 0 8px',
  padding: '0',
}

const h3 = {
  color: '#1a1a1a',
  fontSize: '16px',
  fontWeight: '600',
  margin: '12px 0 8px',
  padding: '0',
}

const text = {
  color: '#444',
  fontSize: '16px',
  lineHeight: '26px',
  margin: '16px 0',
}

const updateSection = {
  margin: '24px 0',
}

const updateText = {
  color: '#555',
  fontSize: '15px',
  lineHeight: '24px',
  margin: '0',
}

const buttonSection = {
  textAlign: 'center' as const,
  margin: '32px 0',
}

const button = {
  backgroundColor: '#000000',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 24px',
}

const hr = {
  borderColor: '#e6ebf1',
  margin: '32px 0',
}

const footer = {
  color: '#8898aa',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '8px 0',
  textAlign: 'center' as const,
}

const link = {
  color: '#556cd6',
  textDecoration: 'underline',
}

const updateLink = {
  color: '#556cd6',
  fontSize: '14px',
  textDecoration: 'underline',
  display: 'inline-block',
  marginTop: '6px',
}
