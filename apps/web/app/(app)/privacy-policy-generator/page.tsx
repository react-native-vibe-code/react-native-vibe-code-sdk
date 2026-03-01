import { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle, Globe, FileText, Sparkles, Apple } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { GetStartedButton } from './get-started-button'

export const metadata: Metadata = {
  metadataBase: new URL('https://reactnativevibecode.com'),
  title: 'Free Privacy Policy Generator for iOS Apps | App Store Compliant | Capsule',
  description: 'Generate free, App Store compliant privacy policies for your iOS apps in minutes. Covers Apple nutrition labels, GDPR, CCPA, COPPA compliance. Updated for December 2025 requirements.',
  keywords: [
    'privacy policy generator',
    'iOS privacy policy',
    'app store privacy policy',
    'apple privacy policy generator',
    'free privacy policy',
    'GDPR privacy policy',
    'CCPA privacy policy',
    'mobile app privacy policy',
    'react native privacy policy',
    'expo privacy policy',
    'app privacy nutrition labels',
  ],
  authors: [{ name: 'Capsule' }],
  creator: 'Capsule',
  publisher: 'Capsule',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://reactnativevibecode.com/privacy-policy-generator',
    siteName: 'Capsule',
    title: 'Free Privacy Policy Generator for iOS Apps | Capsule',
    description: 'Generate App Store compliant privacy policies in minutes. Covers Apple nutrition labels, GDPR, CCPA, and more. Free for indie developers.',
    images: [
      {
        url: '/og-privacy-policy-generator.png',
        width: 1200,
        height: 630,
        alt: 'Capsule Privacy Policy Generator - Create App Store Compliant Policies',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free Privacy Policy Generator for iOS Apps | Capsule',
    description: 'Generate App Store compliant privacy policies in minutes. Covers Apple nutrition labels, GDPR, CCPA, and more.',
    images: ['/og-privacy-policy-generator.png'],
    creator: '@capsulethis',
  },
  alternates: {
    canonical: 'https://reactnativevibecode.com/privacy-policy-generator',
  },
}

// Force static generation for SEO
export const dynamic = 'force-static'

export default function PolicyGeneratorPage() {
  return (
    <div className="py-12 md:py-20">
      <div className="max-w-6xl mx-auto px-4 md:px-8">
        {/* Hero Section */}
        <div className="text-center mb-16 md:mb-24">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-500 text-sm font-medium mb-6">
            <Apple className="w-4 h-4" />
            Updated for App Store Dec 2025
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight">
            Generate Privacy Policies
            <br />
            <span className="text-purple-500">for iOS Apps</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Create compliant privacy policies for the App Store in minutes.
            Answer simple questions and get a ready-to-use policy with Apple&apos;s nutrition label data.
          </p>
          <GetStartedButton />
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* Apple Compliance Card */}
          <BentoCard className="md:col-span-2 p-8 md:p-12">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
              <div className="max-w-md">
                <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-3">
                  App Store Ready
                </h2>
                <p className="text-muted-foreground text-sm md:text-base leading-relaxed">
                  Generate policies that meet Apple&apos;s latest requirements including the App Privacy Details
                  (nutrition labels). Our questionnaire covers all data categories Apple requires you to disclose.
                </p>
              </div>
              <div className="flex flex-col gap-2 min-w-[280px]">
                <ComplianceItem text="Privacy Nutrition Labels" />
                <ComplianceItem text="Data Collection Disclosure" />
                <ComplianceItem text="Third-Party AI Consent (Nov 2025)" />
                <ComplianceItem text="Tracking Transparency" />
              </div>
            </div>
          </BentoCard>

          {/* GDPR/CCPA Card */}
          <BentoCard className="p-8 md:p-12 flex flex-col min-h-[280px]">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Globe className="w-4 h-4 text-blue-500" />
              </div>
              <h2 className="text-xl md:text-2xl font-semibold text-foreground">
                Global Compliance
              </h2>
            </div>
            <p className="text-muted-foreground text-sm md:text-base leading-relaxed mb-6">
              Cover users worldwide with sections for GDPR (EU), CCPA/CPRA (California),
              LGPD (Brazil), PIPEDA (Canada), and more. Select your target regions and
              we&apos;ll include the relevant legal requirements.
            </p>
            <div className="flex-1 flex items-start">
              <div className="flex flex-wrap gap-4 pr-8">
                {['GDPR', 'CCPA', 'COPPA', 'LGPD', 'PIPEDA'].map((reg) => (
                  <span
                    key={reg}
                    className="px-5 py-1 rounded-full bg-blue-500/10 text-blue-500 text-md font-medium"
                  >
                    {reg}
                  </span>
                ))}
              </div>
            </div>
          </BentoCard>

          {/* Easy Questionnaire Card */}
          <BentoCard className="p-8 md:p-12 flex flex-col min-h-[280px]">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-green-500" />
              </div>
              <h2 className="text-xl md:text-2xl font-semibold text-foreground">
                Simple Questions
              </h2>
            </div>
            <p className="text-muted-foreground text-sm md:text-base leading-relaxed mb-6">
              No legal expertise needed. Answer straightforward questions about your app
              and we&apos;ll generate a comprehensive privacy policy. Auto-saves your progress
              so you can complete it at your own pace.
            </p>
            <div className="flex-1 flex items-end">
              <div className="w-full space-y-2">
                {[
                  { step: 1, text: 'App Information', done: true },
                  { step: 2, text: 'Data Collection', done: true },
                  { step: 3, text: 'Third-Party Services', done: false },
                ].map((item) => (
                  <div
                    key={item.step}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg',
                      item.done ? 'bg-green-500/10' : 'bg-muted-foreground/5'
                    )}
                  >
                    <div
                      className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium',
                        item.done
                          ? 'bg-green-500 text-white'
                          : 'bg-muted-foreground/20 text-muted-foreground'
                      )}
                    >
                      {item.done ? <CheckCircle className="w-4 h-4" /> : item.step}
                    </div>
                    <span className={cn('text-sm', item.done ? 'text-foreground' : 'text-muted-foreground')}>
                      {item.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </BentoCard>

          {/* Output Card */}
          <BentoCard className="md:col-span-2 p-8 md:p-12">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
              <div className="w-full">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-amber-500" />
                  </div>
                  <h2 className="text-xl md:text-2xl font-semibold text-foreground">
                    Ready to Use 
                  </h2>
                </div>
                <p className="text-muted-foreground text-sm md:text-base leading-relaxed mb-4">
                  Get your privacy policy as a sharable URL to paste on App store required submission field or if you want to in clean Markdown format. Copy it directly, download as a file,
                  or host it on your website. Plus, get a separate summary for Apple&apos;s App Privacy nutrition labels.
                </p>
              </div>
              <div className="max-w-xl flex flex-row items-center flex-wrap">
                <div className="min-w-full p-4 rounded-lg bg-muted-foreground/5 border border-muted-foreground/10">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                    <span className="hidden md:block text-sm text-muted-foreground font-mono">https://reactnativevibecode.com/policy/7c4b6f8e1e9a</span>
                    <span className="md:hidden text-sm text-muted-foreground font-mono">https://cap.com/policy/7c4b6</span>
                  </div>
                </div>
                <p className="m-auto text-sm text-muted-foreground mb-3 mt-2">
                  Shareable link for app store required policy URL field.
                </p>
              </div>
            </div>
          </BentoCard>
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-16 md:mt-24">
          <p className="text-muted-foreground text-sm md:text-base mb-4">
            Ready to vibe code amazing native mobile and web apps?
          </p>
          <Link href="/">
            <Button className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-6 text-lg rounded-full">
              Start creating with Capsule
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

function BentoCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-2xl md:rounded-3xl bg-card border border-border/50 shadow-sm hover:shadow-md transition-shadow',
        className
      )}
    >
      {children}
    </div>
  )
}

function ComplianceItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20">
      <div className="text-green-500">
        <CheckCircle className="w-4 h-4" />
      </div>
      <span className="text-sm font-medium text-foreground">{text}</span>
    </div>
  )
}
