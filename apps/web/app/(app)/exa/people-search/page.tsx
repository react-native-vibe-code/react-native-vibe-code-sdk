import { Metadata } from 'next'
import Link from 'next/link'
import { Search, Users, Sparkles, Code, Database, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ExaAppClient } from './exa-app-client'
import { ExaNavHeader } from '@/components/exa-nav-header'

export const metadata: Metadata = {
  metadataBase: new URL('https://reactnativevibecode.com'),
  title: 'Exa App Generator - Build People Search Apps | Capsule',
  description: 'Generate AI-powered people search applications with semantic search over 1 billion profiles. Perfect for sales, recruiting, and market research teams.',
  keywords: [
    'exa api',
    'people search app',
    'semantic search',
    'recruiting tools',
    'sales prospecting',
    'market research',
    'ai app builder',
    'exa embeddings',
    'profile search',
    'people finder',
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
    url: 'https://reactnativevibecode.com/exa/people-search',
    siteName: 'Capsule',
    title: 'Exa App Generator - Build People Search Apps | Capsule',
    description: 'Generate AI-powered people search applications with semantic search over 1 billion profiles.',
    images: [
      {
        url: '/og-exa-people.png',
        width: 1200,
        height: 630,
        alt: 'Capsule Exa App Generator - Build People Search Applications',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Exa App Generator - Build People Search Apps | Capsule',
    description: 'Generate AI-powered people search applications with semantic search over 1 billion profiles.',
    images: ['/og-exa-people.png'],
    creator: '@capsulethis',
  },
  alternates: {
    canonical: 'https://reactnativevibecode.com/exa/people-search',
  },
}

// Force static generation for SEO
export const dynamic = 'force-static'

export default function ExaPeoplePage() {
  return (
    <>
      <ExaNavHeader />
      <div className="py-12 md:py-20">
        <div className="max-w-6xl mx-auto px-4 md:px-8">
        {/* Hero Section */}
        <div className="text-center mb-16 md:mb-24">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-500 text-sm font-medium mb-6">
            <Search className="w-4 h-4" />
            Powered by Exa AI
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight">
            Build             <span className="text-blue-500">Exa</span> People Search Apps
            <br />
            <span className="text-blue-500">in Seconds</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Vibe code custom apps using Exa powerful people search feature. It lets you find the right people around companies, team, customers, or research.
            Powered by semantic search over 1 billion profiles.
          </p>

          {/* Chat Input Section */}
          <div className="max-w-3xl mx-auto mt-12">
            <ExaAppClient />
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* Semantic Search Card */}
          <BentoCard className="md:col-span-2 p-8 md:p-12">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Database className="w-4 h-4 text-blue-500" />
                  </div>
                  <h2 className="text-xl md:text-2xl font-semibold text-foreground">
                    Semantic Search at Scale
                  </h2>
                </div>
                <p className="text-muted-foreground text-sm md:text-base leading-relaxed">
                  Search over 1 billion people using a hybrid retrieval system backed by finetuned Exa embeddings.
                  Find exactly who you&apos;re looking for with AI-powered semantic understanding that goes beyond
                  simple keyword matching.
                </p>
              </div>
              <div className="flex flex-col gap-3 min-w-[280px]">
                <SearchFeature text="1B+ Profiles" />
                <SearchFeature text="Hybrid Retrieval" />
                <SearchFeature text="Exa Embeddings" />
                <SearchFeature text="Semantic Understanding" />
              </div>
            </div>
          </BentoCard>

          {/* Use Cases Card */}
          <BentoCard className="p-8 md:p-12 flex flex-col min-h-[280px]">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                <Users className="w-4 h-4 text-green-500" />
              </div>
              <h2 className="text-xl md:text-2xl font-semibold text-foreground">
                Built for Teams
              </h2>
            </div>
            <p className="text-muted-foreground text-sm md:text-base leading-relaxed mb-6">
              Create custom search apps tailored for sales, recruiting, market research teams,
              or anyone looking for specific types of profiles like founders, engineers, or executives.
            </p>
            <div className="flex-1 flex items-end">
              <div className="w-full space-y-2">
                {[
                  { icon: '💼', text: 'Sales Prospecting', color: 'bg-blue-500/10' },
                  { icon: '🎯', text: 'Recruiting & Talent', color: 'bg-green-500/10' },
                  { icon: '📊', text: 'Market Research', color: 'bg-purple-500/10' },
                ].map((item) => (
                  <div
                    key={item.text}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg',
                      item.color
                    )}
                  >
                    <span className="text-xl">{item.icon}</span>
                    <span className="text-sm font-medium text-foreground">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </BentoCard>

          {/* Query Generator Card */}
          <BentoCard className="p-8 md:p-12 flex flex-col min-h-[280px]">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <Code className="w-4 h-4 text-purple-500" />
              </div>
              <h2 className="text-xl md:text-2xl font-semibold text-foreground">
                Smart Query Generator
              </h2>
            </div>
            <p className="text-muted-foreground text-sm md:text-base leading-relaxed mb-6">
              Build sophisticated search queries with natural language. Target by role, company,
              location, industry, or any combination that matches your needs.
            </p>
            <div className="flex-1 flex items-end">
              <div className="w-full space-y-3">
                <QueryExample text="VP of product at Figma" />
                <QueryExample text="Engineers at Browserbase" />
                <QueryExample text="Founders in San Francisco" />
              </div>
            </div>
          </BentoCard>

          {/* Output Card */}
          <BentoCard className="md:col-span-2 p-8 md:p-12">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
              <div className="w-full">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                  </div>
                  <h2 className="text-xl md:text-2xl font-semibold text-foreground">
                    Production-Ready Apps
                  </h2>
                </div>
                <p className="text-muted-foreground text-sm md:text-base leading-relaxed mb-4">
                  Get fully functional React Native and web apps with beautiful UIs, real-time search,
                  filtering, and export capabilities. Deploy instantly or customize further.
                </p>
              </div>
              <div className="max-w-xl flex flex-col gap-3 min-w-[300px]">
                <div className="p-4 rounded-lg bg-muted-foreground/5 border border-muted-foreground/10">
                  <div className="flex items-center gap-3 mb-2">
                    <Globe className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-medium text-foreground">Multi-Platform</span>
                  </div>
                  <p className="text-xs text-muted-foreground">iOS, Android, and Web ready</p>
                </div>
                <div className="p-4 rounded-lg bg-muted-foreground/5 border border-muted-foreground/10">
                  <div className="flex items-center gap-3 mb-2">
                    <Code className="w-4 h-4 text-purple-500" />
                    <span className="text-sm font-medium text-foreground">Full Source Code</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Customize and extend as needed</p>
                </div>
              </div>
            </div>
          </BentoCard>
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-16 md:mt-24">
          <p className="text-muted-foreground text-sm md:text-base mb-4">
            Ready to build more amazing apps with Capsule?
          </p>
          <Link href="/">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 text-lg rounded-full">
              Explore All Features
            </Button>
          </Link>
        </div>
      </div>
      </div>
    </>
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

function SearchFeature({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
      <div className="text-blue-500">
        <Search className="w-4 h-4" />
      </div>
      <span className="text-sm font-medium text-foreground">{text}</span>
    </div>
  )
}

function QueryExample({ text }: { text: string }) {
  return (
    <div className="px-4 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
      <span className="text-sm font-mono text-foreground">&quot;{text}&quot;</span>
    </div>
  )
}
