"use client"

import { Session } from "@/lib/auth"
import { Project } from '@react-native-vibe-code/database'
import { signInWithGoogle } from "@/lib/auth/client"
import { useTheme } from "next-themes"
import { useDevMode } from "@/context/dev-mode-context"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { TwitterLogoIcon } from "@radix-ui/react-icons"
import { toast } from "sonner"
import {
  MessageSquare,
  Image,
  FolderOpen,
  Database,
  Cloud,
  KeyRound,
  Download,
  Rocket,
  ExternalLink,
  GitFork,
  Crown,
  User,
  Settings,
  Code,
  Sun,
  Moon,
  Monitor,
  LogOut,
} from "lucide-react"

interface MobileBurgerMenuProps {
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
  onSignOut?: () => void
  onClose: () => void
}

export function MobileBurgerMenu({
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
  onSignOut,
  onClose,
}: MobileBurgerMenuProps) {
  const { theme, setTheme } = useTheme()
  const { isDevMode, setIsDevMode } = useDevMode()

  const deployedUrl = currentProject?.deployedUrl || ""

  const handlePanelClick = (panel: string | null) => {
    onPanelChange(panel)
    onClose()
  }

  const handleDownload = async () => {
    if (!projectId || !session?.user?.id) {
      toast.error('Unable to download project')
      return
    }

    try {
      toast.info('Preparing download...')
      const downloadUrl = `/api/projects/${projectId}/download?userID=${session.user.id}`
      const response = await fetch(downloadUrl)

      if (!response.ok) {
        const error = await response.json()
        toast.error(error.error || 'Failed to download project')
        return
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${projectTitle || 'project'}-${projectId}.zip`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('Project downloaded successfully')
    } catch (error) {
      console.error('[Download] Error:', error)
      toast.error('Failed to download project')
    }
    onClose()
  }

  const handleVisitWebapp = () => {
    if (deployedUrl) {
      const url = deployedUrl.startsWith('http') ? deployedUrl : `https://${deployedUrl}`
      window.open(url, '_blank')
    }
    onClose()
  }

  const handleCopyRemixUrl = async () => {
    if (!projectId) return
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    const url = `${baseUrl}/p/${projectId}/remix`

    try {
      await navigator.clipboard.writeText(url)
      toast.success('Remix link copied to clipboard')
    } catch (error) {
      toast.error('Failed to copy link')
    }
    onClose()
  }

  const handleSignOut = () => {
    if (onSignOut) {
      onSignOut()
    }
    onClose()
  }

  const navigationItems = [
    { id: null, label: "Chat", icon: MessageSquare },
    { id: "assets", label: "Assets", icon: Image },
    { id: "cloud", label: "Cloud", icon: Cloud },
    { id: "auth", label: "Authentication", icon: KeyRound },
    { id: "projects", label: "Projects", icon: FolderOpen },
    { id: "backend", label: "Backend", icon: Database },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* User Info Header */}
      {session ? (
        <div className="flex items-center gap-3 pb-4 border-b mb-4">
          <Avatar className="w-10 h-10">
            <AvatarImage
              src={session.user.image || "https://avatar.vercel.sh/" + session.user.email}
              alt={session.user.email}
            />
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{session.user.name || "User"}</p>
            <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
          </div>
        </div>
      ) : (
        <div className="pb-4 border-b mb-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              signInWithGoogle()
              onClose()
            }}
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </Button>
        </div>
      )}

      {/* Navigation */}
      <div className="space-y-1 pb-4 border-b mb-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Navigation</p>
        {navigationItems.map((item) => (
          <button
            key={item.id || "chat"}
            onClick={() => handlePanelClick(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
              activePanel === item.id
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent/50"
            }`}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </div>

      {/* Project Actions */}
      <div className="space-y-1 pb-4 border-b mb-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Project</p>

        <button
          onClick={handleDownload}
          disabled={!projectId || !session?.user?.id}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent/50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="h-4 w-4" />
          Download
        </button>

        <button
          onClick={() => {
            // Open publish flow - this will need to open a modal or navigate
            toast.info('Opening publish options...')
            onClose()
          }}
          disabled={!projectId || !sandboxId || !session?.user?.id}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent/50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Rocket className="h-4 w-4" />
          Publish
        </button>

        {deployedUrl && (
          <button
            onClick={handleVisitWebapp}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent/50"
          >
            <ExternalLink className="h-4 w-4" />
            Visit Webapp
          </button>
        )}

        {projectId && currentProject?.isPublic && (
          <button
            onClick={handleCopyRemixUrl}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent/50"
          >
            <GitFork className="h-4 w-4" />
            Copy Remix Link
          </button>
        )}
      </div>

      {/* Account & Settings */}
      {session && (
        <div className="space-y-1 pb-4 border-b mb-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Account</p>

          <button
            onClick={() => {
              window.open("https://x.com/capsulethis", "_blank")
              onClose()
            }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent/50"
          >
            <TwitterLogoIcon className="h-4 w-4" />
            Follow us on X
          </button>

          <button
            onClick={() => {
              onOpenSubscriptionModal()
              onClose()
            }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent/50"
          >
            <Crown className="h-4 w-4" />
            Manage Subscription
          </button>

          <button
            onClick={() => {
              onOpenUserSettingsModal()
              onClose()
            }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent/50"
          >
            <User className="h-4 w-4" />
            User Settings
          </button>

          <button
            onClick={() => {
              onOpenProjectSettingsModal()
              onClose()
            }}
            disabled={!projectId || !session?.user?.id}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Settings className="h-4 w-4" />
            App Settings
          </button>

          <button
            onClick={() => setIsDevMode(!isDevMode)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent/50"
          >
            <div className="flex items-center gap-3">
              <Code className="h-4 w-4" />
              Dev Mode
            </div>
            <Switch checked={isDevMode} />
          </button>

          <button
            onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent/50"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : theme === "light" ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Monitor className="h-4 w-4" />
            )}
            Theme: {theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System"}
          </button>
        </div>
      )}

      {/* Sign Out */}
      {session && (
        <div className="mt-auto">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent/50 text-destructive"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
