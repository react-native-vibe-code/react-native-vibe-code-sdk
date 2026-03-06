"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowRight, Eye, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ScreenshotGallery } from "@/components/ui-prompts/screenshot-gallery"
import { PromptCodeBlock } from "@/components/ui-prompts/prompt-code-block"
import type { UiPrompt } from "@react-native-vibe-code/database"

interface PromptDetailProps {
  slug: string
  isAuthenticated: boolean
}

export function PromptDetail({ slug, isAuthenticated }: PromptDetailProps) {
  const router = useRouter()
  const [prompt, setPrompt] = useState<UiPrompt | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchPrompt() {
      try {
        const res = await fetch(`/api/ui-prompts/${slug}`)
        if (!res.ok) {
          router.push("/ui-prompts")
          return
        }
        const data = await res.json()
        setPrompt(data.prompt)
      } catch {
        router.push("/ui-prompts")
      } finally {
        setLoading(false)
      }
    }

    fetchPrompt()
  }, [slug, router])

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 w-40 bg-muted rounded mb-8" />
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
          <div className="lg:w-[60%] flex justify-center">
            <div className="w-[280px] bg-muted rounded-[2rem]" style={{ aspectRatio: "9 / 19.5" }} />
          </div>
          <div className="lg:w-[40%] space-y-4">
            <div className="h-8 w-3/4 bg-muted rounded" />
            <div className="h-4 w-full bg-muted rounded" />
            <div className="h-4 w-2/3 bg-muted rounded" />
            <div className="flex gap-2 mt-4">
              <div className="h-6 w-16 bg-muted rounded-full" />
              <div className="h-6 w-16 bg-muted rounded-full" />
            </div>
            <div className="h-40 bg-muted rounded-xl mt-6" />
          </div>
        </div>
      </div>
    )
  }

  if (!prompt) return null

  const screenshots = [prompt.thumbnailUrl, ...(prompt.screenshotUrls ?? [])]

  return (
    <div>
      {/* Mobile: Title + Description on top */}
      <div className="lg:hidden mb-6 space-y-3">
        <div className="flex items-start gap-1">
          <h1 className="text-2xl font-bold text-foreground">{prompt.title}</h1>
          {prompt.featured && (
            <Badge className="bg-foreground text-background border-foreground/80 hover:bg-foreground flex-shrink-0">
              Featured
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground">{prompt.description}</p>
      </div>

      {/* Side-by-side Layout */}
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
        {/* Left: Video + Gallery */}
        <div className="lg:w-[60%] flex flex-col sm:flex-row items-start gap-3">
          {/* Desktop: video shown side-by-side with gallery */}
          {prompt.videoPreviewUrl && (
            <div className="hidden sm:flex flex-1 min-w-0 justify-center">
              <video
                src={prompt.videoPreviewUrl}
                autoPlay
                loop
                muted
                playsInline
                controls
                className="max-w-[280px] w-full rounded-[2rem] border-[3px] border-neutral-700 bg-black object-cover"
                style={{ aspectRatio: "9 / 19.5" }}
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <ScreenshotGallery
              screenshots={screenshots}
              title={prompt.title}
              videoUrl={prompt.videoPreviewUrl}
            />
          </div>
        </div>

        {/* Right: Details */}
        <div className="lg:w-[40%] space-y-3">
          {/* Title + Featured Badge (desktop only) */}
          <div className="hidden lg:flex items-start gap-1">
            <h1 className="text-2xl font-bold text-foreground">{prompt.title}</h1>
            {prompt.featured && (
              <Badge className="bg-foreground text-background border-foreground/80 hover:bg-foreground flex-shrink-0">
                Featured
              </Badge>
            )}
          </div>

          {/* Description (desktop only) */}
          <p className="hidden lg:block text-muted-foreground">{prompt.description}</p>

          {/* Tags */}
          {prompt.tags && prompt.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {prompt.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground border border-border"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* View Count */}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Eye className="h-4 w-4" />
            <span>{prompt.viewCount.toLocaleString()} views</span>
          </div>

          {/* Prompt Code Block */}
          <PromptCodeBlock
            prompt={prompt.prompt}
            isAuthenticated={isAuthenticated}
          />

          {/* Remix CTA */}
          {prompt.remixUrl && (
            <a
              href={prompt.remixUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-foreground hover:bg-foreground/80 text-background font-medium py-3 px-4 transition-colors"
            >
              <span>Try this design now: remix codebase</span>
              <ArrowRight className="h-4 w-4" />
            </a>
          )}

          {/* Start new app with this prompt */}
          {prompt.prompt && (
            <Link
              href={`/?ui-prompt=${encodeURIComponent(prompt.prompt)}`}
              className="flex items-center justify-center gap-2 w-full rounded-xl border border-border bg-card hover:bg-accent text-foreground font-medium py-3 px-4 transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              <span>Start new app with this prompt</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
