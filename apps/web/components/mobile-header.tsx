"use client"

import { useState } from "react"
import Link from "next/link"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet"
import { MobileBurgerMenu } from "@/components/mobile-burger-menu"
import { Session } from "@/lib/auth"
import { Project } from '@react-native-vibe-code/database'
import * as VisuallyHidden from "@radix-ui/react-visually-hidden"

interface MobileHeaderProps {
  session?: Session | null
  projectId?: string
  projectTitle?: string
  sandboxId?: string
  currentProject?: Project | null
  activePanel: string | null
  onPanelChange: (panel: string | null) => void
  onOpenSubscriptionModal: () => void
  onOpenUserSettingsModal: () => void
  onOpenProjectSettingsModal: () => void
  onOpenPublishOptions: () => void
  onSignOut?: () => void
}

export function MobileHeader({
  session,
  projectId,
  projectTitle,
  sandboxId,
  currentProject,
  activePanel,
  onPanelChange,
  onOpenSubscriptionModal,
  onOpenUserSettingsModal,
  onOpenProjectSettingsModal,
  onOpenPublishOptions,
  onSignOut,
}: MobileHeaderProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <header className="h-[58px] bg-white dark:bg-black border-b flex items-center justify-between px-4">
      {/* Logo */}
      <Link href="/" className="flex items-center">
        <img
          src="/logo-icon-circle.svg"
          alt="Capsule"
          style={{ width: 30, height: 30 }}
        />
      </Link>

      {/* Burger Menu */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="h-10 w-10">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[300px] sm:w-[350px] overflow-y-auto">
          <VisuallyHidden.Root>
            <SheetTitle>Menu</SheetTitle>
          </VisuallyHidden.Root>
          <MobileBurgerMenu
            session={session}
            projectId={projectId}
            projectTitle={projectTitle}
            sandboxId={sandboxId}
            currentProject={currentProject}
            activePanel={activePanel}
            onPanelChange={onPanelChange}
            onOpenSubscriptionModal={onOpenSubscriptionModal}
            onOpenUserSettingsModal={onOpenUserSettingsModal}
            onOpenProjectSettingsModal={onOpenProjectSettingsModal}
            onOpenPublishOptions={onOpenPublishOptions}
            onSignOut={onSignOut}
            onClose={() => setIsOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </header>
  )
}
