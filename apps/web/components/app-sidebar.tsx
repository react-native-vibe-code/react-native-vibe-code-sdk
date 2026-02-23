"use client"

import { useState, useEffect, useRef } from "react"
import { Image, FolderOpen, Database, ChevronLeft, ChevronRight, X, MessageSquare, Cloud, KeyRound } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarRail,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar"
import { AssetsPanel } from "@/components/assets-panel"
import { ProjectsPanel } from "@/components/projects-panel"
import { BackendPanel } from "@/components/backend-panel"
import { CloudSidebarPanel } from "@/components/cloud-sidebar-panel"
import { AuthSidebarPanel } from "@/components/auth-sidebar-panel"
import { UserMenu } from "@/components/user-menu"
import { Session } from "@/lib/auth"
import { cn } from "@/lib/utils"
import Link from "next/link"

interface AppSidebarProps {
  children: React.ReactNode
  sandboxId?: string
  projectId?: string
  userId?: string
  session?: Session | null
  onOpenSubscriptionModal?: () => void
  onOpenUserSettingsModal?: () => void
  onOpenProjectSettingsModal?: () => void
  onSignOut?: () => void
  activePanel?: string | null
  onPanelChange?: (panel: string | null) => void
  cloudEnabled?: boolean
  cloudDeploymentUrl?: string
  onCloudEnabled?: () => void
  onSetupAuth?: () => void
}

function SidebarToggle() {
  const { state, toggleSidebar } = useSidebar()

  return (
    <button
      onClick={toggleSidebar}
      className="absolute -right-3 top-4 z-20 flex h-6 w-6 items-center justify-center rounded-full border bg-background  hover:bg-accent"
    >
      {state === "expanded" ? (
        <ChevronLeft className="h-3 w-3" />
      ) : (
        <ChevronRight className="h-3 w-3" />
      )}
    </button>
  )
}

function SidebarNav({
  activePanel,
  onPanelChange,
  session,
  projectId,
  onOpenSubscriptionModal,
  onOpenUserSettingsModal,
  onOpenProjectSettingsModal,
  onSignOut,
}: {
  activePanel: string | null
  onPanelChange: (panel: string | null) => void
  session?: Session | null
  projectId?: string
  onOpenSubscriptionModal?: () => void
  onOpenUserSettingsModal?: () => void
  onOpenProjectSettingsModal?: () => void
  onSignOut?: () => void
}) {
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  const menuItems = [
    {
      id: "assets",
      label: "Assets",
      icon: Image,
      spacer: false,
    },
    {
      id: "cloud",
      label: "Cloud",
      icon: Cloud,
      spacer: false,
    },
    {
      id: "auth",
      label: "Authentication",
      icon: KeyRound,
      spacer: false,
    },
    {
      id: "backend",
      label: "Backend",
      icon: Database,
      spacer: false,
    },
    {
      id: "projects",
      label: "Projects",
      icon: FolderOpen,
      spacer: true,
    },
  ]

  return (
    <Sidebar collapsible="icon" className="border-r pt-[10px] bg-white dark:bg-black">
      <Link href="/" className="flex items-center gap-2 justify-center w-full bg-white dark:bg-black" >
                  {/* <img src={mounted && resolvedTheme === 'dark' ? '/logo_small_dark.svg' : '/logo_small.svg'}
                    alt="Logo"
                    className="w-[120px] h-[29px] sm:w-[240px] sm:h-[58px]"
                  /> */}
                  <img src={'/logo-icon-circle.svg'}
                    style={{width: 30, height: 30}}
                  />
                </Link>
      <SidebarContent className="pt-2 bg-white dark:bg-black ">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Chat"
                  isActive={activePanel === null}
                  onClick={() => onPanelChange(null)}
                  className={cn(
                    "transition-colors",
                    activePanel === null && "bg-accent"
                  )}
                >
                  <MessageSquare className="h-6 w-6" />
                  <span>Chat</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.id} className={item.spacer && 'border-t-1 border-gray-300 pt-2 mt-2'}>
                  <SidebarMenuButton
                    tooltip={item.label}
                    isActive={activePanel === item.id}
                    onClick={() => onPanelChange(activePanel === item.id ? null : item.id)}
                    className={cn(
                      "transition-colors ",
                      activePanel === item.id && "bg-accent"
                    )}
                  >
                    <item.icon className="h-6 w-6" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-2 bg-white dark:bg-black">
        <UserMenu
          session={session}
          projectId={projectId}
          onOpenSubscriptionModal={onOpenSubscriptionModal || (() => {})}
          onOpenUserSettingsModal={onOpenUserSettingsModal || (() => {})}
          onOpenProjectSettingsModal={onOpenProjectSettingsModal || (() => {})}
          onSignOut={onSignOut}
          collapsed={isCollapsed}
        />
      </SidebarFooter>
      <SidebarRail />
      {/* <SidebarToggle /> */}
    </Sidebar>
  )
}

// Panel content wrapper with conditional animation
function PanelContent({
  isBottomOption,
  isOpen,
  isFirstOpen,
  isSwitching,
  children,
  onClose,
}: {
  isBottomOption?: boolean
  isOpen: boolean
  isFirstOpen: boolean
  isSwitching: boolean
  children: React.ReactNode
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Handle click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        // Check if clicked on sidebar (don't close if clicking sidebar items)
        const sidebar = document.querySelector('[data-sidebar="sidebar"]')
        if (sidebar && sidebar.contains(event.target as Node)) {
          return
        }
        onClose()
      }
    }

    if (isOpen) {
      // Delay adding listener to avoid immediate close
      const timer = setTimeout(() => {
        document.addEventListener("mousedown", handleClickOutside)
      }, 0)
      return () => {
        clearTimeout(timer)
        document.removeEventListener("mousedown", handleClickOutside)
      }
    }
  }, [isOpen, onClose])

  // Handle escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape)
      return () => document.removeEventListener("keydown", handleEscape)
    }
  }, [isOpen, onClose])

  // When switching between panels, no animation needed
  if (isSwitching) {
    return (
      <div
        ref={panelRef}
        className={cn(
          "absolute inset-y-0 left-0 z-40 w-full sm:max-w-[500px] bg-background border-r ",
          isOpen ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-full pointer-events-none hidden",
          isBottomOption && "max-h-[calc(100%-85px)]"
        )}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-50 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
        {children}
      </div>
    )
  }

  return (
    <div
      ref={panelRef}
      className={cn(
        "absolute inset-y-0 left-0 z-40 w-full sm:max-w-[500px] bg-background border-r ",
        "transition-all duration-300 ease-in-out",
        isOpen
          ? isFirstOpen
            ? "opacity-100 translate-x-0 animate-in slide-in-from-left duration-300"
            : "opacity-100 translate-x-0"
          : "opacity-0 -translate-x-full pointer-events-none",
        isBottomOption && "max-h-[calc(100%-85px)] border-b-1 border-gray-300"
      )}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-50 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </button>
      {children}
    </div>
  )
}

export function AppSidebar({
  children,
  sandboxId,
  projectId,
  userId,
  session,
  onOpenSubscriptionModal,
  onOpenUserSettingsModal,
  onOpenProjectSettingsModal,
  onSignOut,
  activePanel: controlledActivePanel,
  onPanelChange,
  cloudEnabled,
  cloudDeploymentUrl,
  onCloudEnabled,
  onSetupAuth,
}: AppSidebarProps) {
  const [internalActivePanel, setInternalActivePanel] = useState<string | null>(null)
  const [isFirstOpen, setIsFirstOpen] = useState(true)
  const [isSwitching, setIsSwitching] = useState(false)

  // Use controlled state if provided, otherwise use internal state
  const activePanel = controlledActivePanel !== undefined ? controlledActivePanel : internalActivePanel
  const setActivePanel = onPanelChange || setInternalActivePanel

  const handlePanelChange = (panel: string | null) => {
    // Determine animation type before changing panel
    if (panel !== null && activePanel === null) {
      // Opening from closed state - use slide animation
      setIsFirstOpen(true)
      setIsSwitching(false)
    } else if (panel !== null && activePanel !== null && panel !== activePanel) {
      // Switching between panels - no animation
      setIsSwitching(true)
      setIsFirstOpen(false)
    } else if (panel === null) {
      // Closing panel - use exit animation
      setIsSwitching(false)
    }
    setActivePanel(panel)
  }

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex h-full w-full">
        {/* Sidebar - always visible and clickable */}
        <div className="relative z-50">
          <SidebarNav
            activePanel={activePanel}
            onPanelChange={handlePanelChange}
            session={session}
            projectId={projectId}
            onOpenSubscriptionModal={onOpenSubscriptionModal}
            onOpenUserSettingsModal={onOpenUserSettingsModal}
            onOpenProjectSettingsModal={onOpenProjectSettingsModal}
            onSignOut={onSignOut}
          />
        </div>

        {/* Main content area with panel overlay */}
        <div className="relative flex-1 min-w-0">
          {/* Main content - always mounted */}
          <div className="h-full w-full">
            {children}
          </div>

          {/* Panel overlay area - positioned relative to content area */}
          <PanelContent
            isOpen={activePanel === "assets"}
            isFirstOpen={isFirstOpen}
            isSwitching={isSwitching}
            onClose={() => handlePanelChange(null)}
          >
            <AssetsPanel
              sandboxId={sandboxId}
              projectId={projectId}
              onClose={() => handlePanelChange(null)}
            />
          </PanelContent>

          <PanelContent
            isOpen={activePanel === "projects"}
            isFirstOpen={isFirstOpen}
            isSwitching={isSwitching}
            onClose={() => handlePanelChange(null)}
          >
            <ProjectsPanel
              userId={userId}
              onClose={() => handlePanelChange(null)}
            />
          </PanelContent>

          <PanelContent
            isOpen={activePanel === "backend"}
            isFirstOpen={isFirstOpen}
            isSwitching={isSwitching}
            onClose={() => handlePanelChange(null)}
          >
            <BackendPanel
              projectId={projectId}
              onClose={() => handlePanelChange(null)}
            />
          </PanelContent>

          <PanelContent
            isOpen={activePanel === "cloud"}
            isFirstOpen={isFirstOpen}
            isSwitching={isSwitching}
            onClose={() => handlePanelChange(null)}
            isBottomOption
          >
            <CloudSidebarPanel
              projectId={projectId}
              cloudEnabled={cloudEnabled || false}
              deploymentUrl={cloudDeploymentUrl}
              onCloudEnabled={onCloudEnabled}
              onNavigateToAuth={() => handlePanelChange('auth')}
              onClose={() => handlePanelChange(null)}
            />
          </PanelContent>

          <PanelContent
            isOpen={activePanel === "auth"}
            isFirstOpen={isFirstOpen}
            isSwitching={isSwitching}
            onClose={() => handlePanelChange(null)}
            isBottomOption
          >
            <AuthSidebarPanel
              projectId={projectId}
              cloudEnabled={cloudEnabled || false}
              onNavigateToCloud={() => handlePanelChange('cloud')}
              onSetupAuth={onSetupAuth || (() => {})}
              onClose={() => handlePanelChange(null)}
            />
          </PanelContent>
        </div>
      </div>
    </SidebarProvider>
  )
}
