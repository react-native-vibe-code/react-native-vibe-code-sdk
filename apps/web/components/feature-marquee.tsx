'use client'

import { cn } from '@/lib/utils'
import { Sparkles, History, Globe, MousePointer2, Mic, Server, Database, Smartphone, Zap, Plug } from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

export const FEATURES = [
  {
    id: 'agent',
    title: 'Best Code Agent',
    description: 'React Native Vibe Code integrates Claude Code, the revolutionary coding agent. Powered by Claude Opus 4.5 by default.',
    icon: <Sparkles className="w-5 h-5 text-indigo-500" />,
    bg: 'bg-indigo-500/10',
    color: 'text-indigo-500',
    content: (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground">The most powerful coding model on the planet, integrated directly into your workflow.</p>
        <div className="flex flex-col gap-2">
           <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-foreground/5 border border-foreground/10">
            <div className="flex items-center gap-3">
              <Image src="/claude-color.svg" alt="Claude" width={24} height={24} />
              <span className="font-medium text-foreground">Claude Opus 4.5</span>
            </div>
            <span className="text-xs text-muted-foreground">default</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-muted-foreground/5 border border-transparent">
            <div className="flex items-center gap-3">
              <Image src="/claude-color.svg" alt="Claude" width={24} height={24} />
              <span className="font-medium text-muted-foreground">Claude Sonnet 4.5</span>
            </div>
            <span className="text-xs text-muted-foreground">optional</span>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'history',
    title: 'History Backup',
    description: 'Rollback to any previous version. Every change is saved on each prompt.',
    icon: <History className="w-5 h-5 text-amber-500" />,
    bg: 'bg-amber-500/10',
    color: 'text-amber-500',
    content: (
       <div className="space-y-4">
        <p className="text-muted-foreground">A safety net for experimenting without worries. Rollback if changes don't suit you.</p>
        <div className="space-y-2">
          {[
            { time: '2 min ago', label: 'Added login screen', active: true },
            { time: '5 min ago', label: 'Updated navigation' },
            { time: '12 min ago', label: 'Initial setup' },
          ].map((item, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center justify-between px-3 py-2 rounded-lg border",
                item.active
                  ? "bg-amber-500/10 border-amber-500/30"
                  : "bg-muted-foreground/5 border-muted-foreground/10"
              )}
            >
              <div className="flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full", item.active ? "bg-amber-500" : "bg-muted-foreground/30")} />
                <span className="text-sm text-foreground">{item.label}</span>
              </div>
              <span className="text-xs text-muted-foreground">{item.time}</span>
            </div>
          ))}
        </div>
      </div>
    )
  },
  {
    id: 'preview',
    title: 'Live Preview',
    description: 'See your iOS, Android, and web apps render in real-time as the AI builds.',
    icon: <Zap className="w-5 h-5 text-green-500" />,
    bg: 'bg-green-500/10',
    color: 'text-green-500',
    content: (
      <div className="space-y-4">
        <p className="text-muted-foreground">Instant visual feedback on your phone and browser. No waiting, no refreshing.</p>
        <div className="flex gap-2 w-full">
          <div className="flex-1 h-20 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/30 flex items-center justify-center">
            <span className="text-xs text-muted-foreground font-medium">iOS</span>
          </div>
          <div className="flex-1 h-20 rounded-lg bg-gradient-to-br from-green-500/20 to-teal-500/20 border border-green-500/30 flex items-center justify-center">
            <span className="text-xs text-muted-foreground font-medium">Android</span>
          </div>
          <div className="flex-1 h-20 rounded-lg bg-gradient-to-br from-orange-500/20 to-yellow-500/20 border border-orange-500/30 flex items-center justify-center">
            <span className="text-xs text-muted-foreground font-medium">Web</span>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'cloud',
    title: 'Automatic Backend',
    description: 'Connected pieces: database and backend logic automatically created.',
    icon: <Database className="w-5 h-5 text-emerald-500" />,
    bg: 'bg-emerald-500/10',
    color: 'text-emerald-500',
    content: (
      <div className="space-y-6">
        <p className="text-muted-foreground">Every app can get a fullstack integration by enabling the cloud option. Powered by Convex.</p>
        <div className="flex items-center justify-center gap-4">
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
              <Server className="w-6 h-6 text-cyan-500" />
            </div>
            <span className="text-xs text-muted-foreground">Backend</span>
          </div>
          <div className="w-8 h-0.5 bg-muted-foreground/30" />
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <Database className="w-6 h-6 text-emerald-500" />
            </div>
            <span className="text-xs text-muted-foreground">Database</span>
          </div>
          <div className="w-8 h-0.5 bg-muted-foreground/30" />
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <Smartphone className="w-6 h-6 text-violet-500" />
            </div>
            <span className="text-xs text-muted-foreground">UI</span>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'publish',
    title: 'Publish to Web',
    description: 'Make your web app go live with a custom domain in one click.',
    icon: <Globe className="w-5 h-5 text-blue-500" />,
    bg: 'bg-blue-500/10',
    color: 'text-blue-500',
    content: (
      <div className="space-y-4">
        <p className="text-muted-foreground">Your universal app running on the web right away, then publish to app stores.</p>
        <div className="w-full p-4 rounded-lg bg-muted-foreground/5 border border-muted-foreground/10">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm text-muted-foreground font-mono truncate">http://my-amazing-app.pages.dev</span>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'voice',
    title: 'Voice Prompting',
    description: 'Vibe coding with your voice sets you free to express ideas naturally.',
    icon: <Mic className="w-5 h-5 text-rose-500" />,
    bg: 'bg-rose-500/10',
    color: 'text-rose-500',
    content: (
      <div className="flex flex-col items-center gap-6">
        <div className="relative flex items-center justify-center h-24">
          <div className="absolute w-20 h-20 rounded-full bg-rose-500/20 animate-ping" />
          <div className="relative w-14 h-14 rounded-full bg-rose-500 flex items-center justify-center shadow-lg shadow-rose-500/30">
            <Mic className="w-7 h-7 text-white" />
          </div>
        </div>
        <p className="text-muted-foreground text-center">Jump into the flow and let the agent listen to your creative vision.</p>
      </div>
    )
  },
  {
    id: 'visual',
    title: 'Visual Edits',
    description: 'Hover and point at visual elements to change them easily.',
    icon: <MousePointer2 className="w-5 h-5 text-purple-500" />,
    bg: 'bg-purple-500/10',
    color: 'text-purple-500',
    content: (
      <div className="space-y-4">
        <p className="text-muted-foreground">No need to explain where to make changes, only what to change. Direct visual control.</p>
        <div className="relative rounded-xl bg-muted-foreground/5 border border-muted-foreground/10 p-4 overflow-hidden">
          <div className="space-y-3 opacity-50">
            <div className="h-4 w-3/4 rounded bg-muted-foreground/10" />
            <div className="h-4 w-1/2 rounded bg-muted-foreground/10" />
            <div className="h-10 w-24 rounded-lg bg-purple-500/20 border-2 border-purple-500 border-dashed" />
          </div>
          <MousePointer2 className="absolute left-1/2 top-1/2 w-6 h-6 text-purple-500 transform -translate-x-1/2 -translate-y-1/2" />
        </div>
      </div>
    )
  },
  {
    id: 'integrations',
    title: 'Integrations',
    description: 'Hundreds of APIs like Google Maps, Search, and Resend built-in.',
    icon: <Plug className="w-5 h-5 text-orange-500" />,
    bg: 'bg-orange-500/10',
    color: 'text-orange-500',
    content: (
      <div className="space-y-4">
        <p className="text-muted-foreground">Ready-to-use libraries that the agent can implement instantly without API key hassle.</p>
        <div className="grid grid-cols-4 gap-3">
          {["https://cdn-icons-png.flaticon.com/512/5968/5968854.png", "https://cdn-icons-png.flaticon.com/512/732/732221.png", "https://cdn-icons-png.flaticon.com/512/733/733609.png", "https://cdn-icons-png.flaticon.com/512/281/281763.png"].map((src, i) => (
            <div key={i} className="h-12 w-12 rounded-xl bg-white dark:bg-gray-300 shadow-sm flex items-center justify-center p-2">
              <Image src={src} alt="icon" width={32} height={32} className="h-8 w-8 object-contain" />
            </div>
          ))}
        </div>
      </div>
    )
  }
]

export function FeatureMarquee() {
  const [selectedFeature, setSelectedFeature] = useState<typeof FEATURES[0] | null>(null)

  return (
    <div className="w-full mt-4 overflow-hidden relative group">
      <div className="flex gap-4 py-8 whitespace-nowrap animate-scroll-left hover:[animation-play-state:paused]">
          {[...Array(3)].flatMap((_, repeatIndex) =>
            FEATURES.map((feature) => (
              <button
                key={`${repeatIndex}-${feature.id}`}
                onClick={() => setSelectedFeature(feature)}
                className="flex-shrink-0 w-[280px] p-6 rounded-2xl bg-card border border-border/50 shadow-sm hover:shadow-xl hover:border-border/80 hover:-translate-y-1 transition-all text-left flex flex-col gap-3 group/card"
              >
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover/card:scale-110", feature.bg)}>
                  {feature.icon}
                </div>
                <div>
                  <h4 className="font-semibold text-foreground mb-1 group-hover/card:text-primary transition-colors">{feature.title}</h4>
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Fade overlays */}
        <div className="absolute left-0 top-0 h-full w-24 bg-gradient-to-r from-background via-background/50 to-transparent pointer-events-none z-10" />
        <div className="absolute right-0 top-0 h-full w-24 bg-gradient-to-l from-background via-background/50 to-transparent pointer-events-none z-10" />

        <Dialog open={!!selectedFeature} onOpenChange={(open) => !open && setSelectedFeature(null)}>
          <DialogContent className="sm:max-w-[425px] overflow-hidden border-none p-0 bg-transparent shadow-2xl">
            <VisuallyHidden>
              <DialogTitle>{selectedFeature?.title}</DialogTitle>
              <DialogDescription>{selectedFeature?.description}</DialogDescription>
            </VisuallyHidden>
            {selectedFeature && (
              <div className="bg-card border border-border/50 rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                <div className={cn("h-32 w-full flex items-center justify-center relative", selectedFeature.bg)}>
                  <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
                  <div className="w-16 h-16 rounded-2xl bg-card border border-border/50 shadow-lg flex items-center justify-center relative z-10 transform -rotate-6 group-hover:rotate-0 transition-transform">
                    {selectedFeature.icon}
                  </div>
                </div>
                <div className="p-8">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-2xl font-bold text-foreground tracking-tight">{selectedFeature.title}</h3>
                    <div className={cn("px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider", selectedFeature.bg, selectedFeature.color)}>
                      Feature
                    </div>
                  </div>
                  <div className="text-foreground leading-relaxed">
                    {selectedFeature.content}
                  </div>
                  <button
                    onClick={() => setSelectedFeature(null)}
                    className="w-full mt-8 py-4 rounded-2xl bg-foreground text-background font-bold hover:opacity-90 active:scale-[0.98] transition-all shadow-lg"
                  >
                    Got it
                  </button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

      <style jsx global>{`
        @keyframes scroll-left {
          0% { transform: translateX(0); }
          100% { transform: translateX(calc(-280px * 8 - 1rem * 8)); }
        }
        .animate-scroll-left {
          animation: scroll-left 40s linear infinite;
        }
      `}</style>
    </div>
  )
}
