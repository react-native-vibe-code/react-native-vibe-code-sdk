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
  unsubscribeUrl?: string
}

export default function WelcomeEmail({ name, unsubscribeUrl }: WelcomeEmailProps) {
  const firstName = name.split(' ')[0]

  return (
    <Html>
      <Head />
      <Preview>Welcome to React Native Vibe Code - Vibe code mobile and web apps with AI</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Welcome to React Native Vibe Code!</Heading>

          <Text style={text}>Hi {firstName},</Text>

          <Text style={text}>
            You're in! <Link target='_blank' href="https://reactnativevibecode.com" style={link}>React Native Vibe Code</Link> lets you turn text to web and native apps at the same time by just prompting. It is also the first open source React Native IDE so all the code is available for you to run locally if you want, explore or bring up a PR to support the community.
          </Text>

          {/* Pricing */}
          <Section style={pricingSection}>
            <Text style={text}>
              We have great starting plans for the cloud version. We have just
              halved prices. Entry plan is just $9.99.
            </Text>

            <Section style={pricingCard}>
              <Heading as="h2" style={pricingName}>Start</Heading>
              <Text style={pricingPrice}>
                $9.99 <span style={pricingPeriod}>/mo</span>
              </Text>
              <Text style={pricingOldPrice}>$20/mo</Text>
              <Text style={pricingFeature}>~ 100 messages monthly</Text>
              <Text style={pricingFeature}>Private projects</Text>
              <Text style={pricingFeature}>Code editor</Text>
              <Text style={pricingFeature}>History restore</Text>
              <Text style={pricingFeature}>Email support</Text>
              <Section style={buttonSection}>
                <Button style={button} href="https://reactnativevibecode.com/subscribe">
                  Subscribe
                </Button>
              </Section>
            </Section>
          </Section>

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
              <strong>☁️ Fullstack Cloud Option</strong>
              <br />
              Every app can be turned into a fullstack app with backend logic and
              database built-in. Powered by Convex.
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
              <strong>🌐 Publish to Web & App Store</strong>
              <br />
              Your app can go live as a web app or a fully native app with our
              publish to web and App Store options.
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
          <Link target='_blank' href="https://reactnativevibecode.com" style={link}>React Native Vibe Code</Link> - Text to mobile & web apps in seconds
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

const pricingSection = {
  margin: '24px 0',
}

const pricingCard = {
  backgroundColor: '#f9fafb',
  borderRadius: '8px',
  border: '1px solid #e5e7eb',
  padding: '24px 20px',
  margin: '16px 0',
  textAlign: 'center' as const,
}

const pricingName = {
  color: '#1a1a1a',
  fontSize: '20px',
  fontWeight: '700',
  margin: '0 0 8px',
}

const pricingPrice = {
  color: '#000000',
  fontSize: '36px',
  fontWeight: '700',
  margin: '0',
  lineHeight: '40px',
}

const pricingPeriod = {
  fontSize: '16px',
  fontWeight: '400',
  color: '#666',
}

const pricingOldPrice = {
  color: '#999',
  fontSize: '16px',
  textDecoration: 'line-through',
  margin: '4px 0 16px',
}

const pricingFeature = {
  color: '#555',
  fontSize: '15px',
  lineHeight: '14px',
  margin: '8px 0',
}
