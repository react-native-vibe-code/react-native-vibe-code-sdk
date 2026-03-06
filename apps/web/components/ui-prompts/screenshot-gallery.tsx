"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { PhoneFrame } from "@/components/ui-prompts/phone-frame"
import { Button } from "@/components/ui/button"
import { useIsMobile } from "@/hooks/use-mobile"

interface ScreenshotGalleryProps {
  screenshots: string[]
  title: string
  /** On mobile, the video is shown as the first carousel item */
  videoUrl?: string | null
}

export function ScreenshotGallery({
  screenshots,
  title,
  videoUrl,
}: ScreenshotGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const isMobile = useIsMobile()

  // Only include video in carousel on mobile
  const includeVideo = isMobile && !!videoUrl
  const totalItems = includeVideo ? screenshots.length + 1 : screenshots.length
  const isVideoSlot = includeVideo && activeIndex === 0
  const screenshotIndex = includeVideo ? activeIndex - 1 : activeIndex

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Main display */}
      {isVideoSlot ? (
        <div className="max-w-[280px] w-full flex justify-center">
          <video
            src={videoUrl!}
            autoPlay
            loop
            muted
            playsInline
            controls
            className="max-w-[280px] w-full rounded-[2rem] border-[3px] border-neutral-700 bg-black object-cover"
            style={{ aspectRatio: "9 / 19.5" }}
          />
        </div>
      ) : (
        <PhoneFrame
          src={screenshots[includeVideo ? screenshotIndex : activeIndex]}
          alt={`${title} - Screenshot ${(includeVideo ? screenshotIndex : activeIndex) + 1}`}
          className="max-w-[280px] w-full"
        />
      )}

      {/* Thumbnail Strip */}
      {totalItems > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() =>
              setActiveIndex((prev) =>
                prev === 0 ? totalItems - 1 : prev - 1
              )
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-2 overflow-x-auto">
            {/* Mobile-only video thumbnail */}
            {includeVideo && (
              <button
                onClick={() => setActiveIndex(0)}
                className={`flex-shrink-0 w-12 h-24 rounded-lg overflow-hidden border-2 transition-colors ${
                  activeIndex === 0
                    ? "border-foreground"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <video
                  src={videoUrl!}
                  muted
                  className="w-full h-full object-cover"
                />
              </button>
            )}
            {screenshots.map((src, index) => {
              const itemIndex = includeVideo ? index + 1 : index
              return (
                <button
                  key={index}
                  onClick={() => setActiveIndex(itemIndex)}
                  className={`flex-shrink-0 w-12 h-24 rounded-lg overflow-hidden border-2 transition-colors ${
                    itemIndex === activeIndex
                      ? "border-foreground"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <img
                    src={src}
                    alt={`${title} - Thumbnail ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              )
            })}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() =>
              setActiveIndex((prev) =>
                prev === totalItems - 1 ? 0 : prev + 1
              )
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
