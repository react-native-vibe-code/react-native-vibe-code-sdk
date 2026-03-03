"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { PhoneFrame } from "@/components/ui-prompts/phone-frame"
import { Button } from "@/components/ui/button"

interface ScreenshotGalleryProps {
  screenshots: string[]
  title: string
}

export function ScreenshotGallery({
  screenshots,
  title,
}: ScreenshotGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0)

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Main Phone Frame */}
      <PhoneFrame
        src={screenshots[activeIndex]}
        alt={`${title} - Screenshot ${activeIndex + 1}`}
        className="max-w-[280px] w-full"
      />

      {/* Thumbnail Strip */}
      {screenshots.length > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() =>
              setActiveIndex((prev) =>
                prev === 0 ? screenshots.length - 1 : prev - 1
              )
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-2 overflow-x-auto">
            {screenshots.map((src, index) => (
              <button
                key={index}
                onClick={() => setActiveIndex(index)}
                className={`flex-shrink-0 w-12 h-24 rounded-lg overflow-hidden border-2 transition-colors ${
                  index === activeIndex
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
            ))}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() =>
              setActiveIndex((prev) =>
                prev === screenshots.length - 1 ? 0 : prev + 1
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
