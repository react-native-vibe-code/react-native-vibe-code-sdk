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

interface WelcomeEmailProps {
  name: string
}

export default function WelcomeEmail({ name }: WelcomeEmailProps) {
  const firstName = name.split(' ')[0]

  return (
    <Html>
      <Head />
      <Preview>Welcome to Capsule - Vibe code mobile and web apps with AI</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Welcome to Capsule!</Heading>

          <Text style={text}>Hi {firstName},</Text>

          <Text style={text}>
            You're in! <Link target='_blank' href="https://reactnativevibecode.com" style={link}>Capsule</Link> lets you vibe code ideas into mobile and web apps.
            Just prompt with text or voice and we'll handle the code for you.
          </Text>

          <Section style={featuresSection}>
            <Heading as="h2" style={h2}>
              What you can do:
            </Heading>

            <Text style={featureItem}>
              <strong>🤖 Best Code Agent by Default</strong>
              <br />
              Powered by Claude Code SDK with Claude Opus 4.5—the most powerful
              coding model on the planet.
            </Text>

            <Text style={featureItem}>
              <strong>📱 Live Preview</strong>
              <br />
              See your iOS, Android, and web apps render in real-time as the AI
              builds. No waiting, no refreshing.
            </Text>

            <Text style={featureItem}>
              <strong>🗄️ Automatic Backend & Database</strong>
              <br />
              Every app comes with backend logic and database built-in. Full-stack
              apps by default, powered by Convex.
            </Text>

            <Text style={featureItem}>
              <strong>⏪ History Backup</strong>
              <br />
              Rollback to any version anytime. Experiment freely with a safety net.
            </Text>

            <Text style={featureItem}>
              <strong>🎤 Voice Prompting</strong>
              <br />
              Vibe code with your voice—express ideas naturally and jump into the flow.
            </Text>

            <Text style={featureItem}>
              <strong>🌐 One-Click Publish</strong>
              <br />
              Make your web app go live with a custom domain instantly.
            </Text>
          </Section>

          <Section style={buttonSection}>
            <Button style={button} href="https://www.reactnativevibecode.com">
              Start Building
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            Need help?{' '}
            <Link href="mailto:contact@reactnativevibecode.com" style={link}>
              Contact us
            </Link>
          </Text>

          <Text style={footer}>
          <Link target='_blank' href="https://reactnativevibecode.com" style={link}>Capsule</Link> - Text to mobile & web apps in seconds
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

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

const h1 = {
  color: '#1a1a1a',
  fontSize: '28px',
  fontWeight: '700',
  margin: '0 0 20px',
  padding: '0',
  textAlign: 'center' as const,
}

const h2 = {
  color: '#1a1a1a',
  fontSize: '18px',
  fontWeight: '600',
  margin: '0 0 16px',
  padding: '0',
}

const text = {
  color: '#444',
  fontSize: '16px',
  lineHeight: '26px',
  margin: '16px 0',
}

const featuresSection = {
  backgroundColor: '#f9fafb',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
}

const featureItem = {
  color: '#444',
  fontSize: '15px',
  lineHeight: '24px',
  margin: '12px 0',
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
