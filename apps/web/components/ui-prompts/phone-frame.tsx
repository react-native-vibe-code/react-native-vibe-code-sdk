"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"

interface PhoneFrameProps {
  src: string
  alt: string
  className?: string
}

export function PhoneFrame({ src, alt, className }: PhoneFrameProps) {
  return (
    <div
      className={cn(
        "relative rounded-[2rem] border-[3px] border-neutral-700 bg-black overflow-hidden",
        className
      )}
      style={{ aspectRatio: "9 / 19.5" }}
    >
      {/* Dynamic Island */}
      <div className="hidden absolute top-3 left-1/2 -translate-x-1/2 z-20 w-[90px] h-[28px] bg-black rounded-full" />

      {/* Status Bar */}
      <div className="hidden absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 pt-3 pb-1">
        {/* Time */}
        <span className="text-white text-xs font-semibold">9:41</span>

        {/* Status Icons */}
        <div className="flex items-center gap-1.5">
          {/* Signal */}
          <svg
            width="16"
            height="12"
            viewBox="0 0 16 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x="0" y="8" width="3" height="4" rx="0.5" fill="white" />
            <rect x="4" y="5" width="3" height="7" rx="0.5" fill="white" />
            <rect x="8" y="2.5" width="3" height="9.5" rx="0.5" fill="white" />
            <rect x="12" y="0" width="3" height="12" rx="0.5" fill="white" />
          </svg>

          {/* WiFi */}
          <svg
            width="14"
            height="12"
            viewBox="0 0 14 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M7 3C9.17 3 11.13 3.82 12.56 5.22L14 3.78C12.15 1.95 9.69 1 7 1C4.31 1 1.85 1.95 0 3.78L1.44 5.22C2.87 3.82 4.83 3 7 3Z"
              fill="white"
            />
            <path
              d="M7 7C8.28 7 9.45 7.47 10.34 8.22L11.78 6.78C10.5 5.62 8.83 5 7 5C5.17 5 3.5 5.62 2.22 6.78L3.66 8.22C4.55 7.47 5.72 7 7 7Z"
              fill="white"
            />
            <circle cx="7" cy="11" r="1.5" fill="white" />
          </svg>

          {/* Battery */}
          <svg
            width="22"
            height="12"
            viewBox="0 0 22 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect
              x="0.5"
              y="0.5"
              width="18"
              height="11"
              rx="2"
              stroke="white"
              strokeOpacity="0.5"
            />
            <rect x="2" y="2" width="15" height="8" rx="1" fill="white" />
            <path
              d="M20 4.5V7.5C20.83 7.17 21.33 6.42 21.33 5.5C21.33 4.58 20.83 3.83 20 3.5V4.5Z"
              fill="white"
              fillOpacity="0.5"
            />
          </svg>
        </div>
      </div>

      {/* Screenshot */}
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover"
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
      />
    </div>
  )
}
