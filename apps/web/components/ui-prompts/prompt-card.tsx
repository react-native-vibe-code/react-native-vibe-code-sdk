"use client"

import Link from "next/link"
import { PhoneFrame } from "./phone-frame"
import { Badge } from "@/components/ui/badge"

interface PromptCardProps {
  slug: string
  title: string
  description: string
  thumbnailUrl: string
  tags: string[]
  featured: boolean
  viewCount: number
  remixUrl?: string | null
}

export function PromptCard({
  slug,
  title,
  description,
  thumbnailUrl,
  tags,
  featured,
  viewCount,
}: PromptCardProps) {
  return (
    <Link href={`/ui-prompts/${slug}`} className="group block">
      <div className="relative rounded-xl border border-border bg-card p-4 hover:border-primary/50 hover:shadow-xl hover:-translate-y-1 transition-all duration-200">
        {/* Featured Badge */}
        {featured && (
          <div className="absolute top-3 left-3 z-10">
            <Badge className="bg-foreground text-background border-foreground/80 hover:bg-foreground">
              Featured
            </Badge>
          </div>
        )}

        {/* Phone Frame */}
        <div className="flex justify-center mb-4">
          <PhoneFrame
            src={thumbnailUrl}
            alt={title}
            className="max-w-[200px] w-full"
          />
        </div>

        {/* Title */}
        <h3 className="text-foreground font-medium truncate group-hover:text-muted-foreground transition-colors">
          {title}
        </h3>

        {/* Description */}
        <p className="text-muted-foreground text-sm mt-1 line-clamp-2">
          {description}
        </p>

        {/* Bottom Row: Tags + View Count */}
        <div className="flex items-center justify-between mt-3 gap-2">
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground border border-border whitespace-nowrap"
              >
                {tag}
              </span>
            ))}
          </div>

          <span className="text-muted-foreground text-xs whitespace-nowrap flex-shrink-0">
            {viewCount.toLocaleString()} views
          </span>
        </div>
      </div>
    </Link>
  )
}
