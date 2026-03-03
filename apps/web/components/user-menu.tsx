"use client"

import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { Session } from "@/lib/auth"
import { signInWithGoogle } from "@/lib/auth/client"
import { TwitterLogoIcon } from "@radix-ui/react-icons"
import {
  Crown,
  LogOut,
  Settings,
  User,
  Sun,
  Moon,
  Monitor,
  Code,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useDevMode } from "@/context/dev-mode-context"

interface UserMenuProps {
  session?: Session | null
  projectId?: string
  onOpenSubscriptionModal: () => void
  onOpenUserSettingsModal: () => void
  onOpenProjectSettingsModal: () => void
  onSignOut?: () => void
  collapsed?: boolean
}

export function UserMenu({
  session,
  projectId,
  onOpenSubscriptionModal,
  onOpenUserSettingsModal,
  onOpenProjectSettingsModal,
  onSignOut,
  collapsed = false,
}: UserMenuProps) {
  const { theme, setTheme } = useTheme()
  const { isDevMode, setIsDevMode } = useDevMode()

  const handleSignOut = () => {
    if (onSignOut) {
      onSignOut()
    }
  }

  if (!session) {
    return (
      <Button
        variant="ghost"
        size={collapsed ? "icon" : "default"}
        onClick={() => signInWithGoogle()}
        className={collapsed ? "w-10 h-10" : "w-full justify-start"}
      >
        <svg className={collapsed ? "h-4 w-4" : "mr-2 h-4 w-4"} viewBox="0 0 24 24">
          <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        {!collapsed && "Sign in"}
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={`flex items-center gap-2 p-2 rounded-lg hover:bg-accent transition-colors w-full ${collapsed ? "justify-center" : ""}`}>
          <Avatar className="w-8 h-8 cursor-pointer">
            <AvatarImage
              src={
                session.user.image ||
                "https://avatar.vercel.sh/" + session.user.email
              }
              alt={session.user.email}
            />
          </Avatar>
          {!collapsed && (
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium truncate">{session.user.name || "User"}</p>
              <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
            </div>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" side="right">
        <DropdownMenuLabel className="flex flex-col">
          <span className="text-sm">My Account</span>
          <span className="text-xs text-muted-foreground">
            {session.user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() =>
          window.open("https://x.com/rnvibecode", "_blank")
        }>
          <TwitterLogoIcon className="mr-2 h-4 w-4 text-muted-foreground" />
          Follow us on X
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={(e) => {
          e.preventDefault()
          onOpenSubscriptionModal()
        }}>
          <Crown className="mr-2 h-4 w-4 text-muted-foreground" />
          Manage Subscription
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={(e) => {
          e.preventDefault()
          onOpenUserSettingsModal()
        }}>
          <User className="mr-2 h-4 w-4 text-muted-foreground" />
          User Settings
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            onOpenProjectSettingsModal()
          }}
          disabled={!projectId || !session?.user?.id}
        >
          <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
          App Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={(e) => {
          e.preventDefault()
          setIsDevMode(!isDevMode)
        }}>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center">
              <Code className="mr-2 h-4 w-4 text-muted-foreground" />
              Dev Mode
            </div>
            <Switch checked={isDevMode} />
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}>
          {theme === "dark" ? (
            <Sun className="mr-2 h-4 w-4 text-muted-foreground" />
          ) : theme === "light" ? (
            <Moon className="mr-2 h-4 w-4 text-muted-foreground" />
          ) : (
            <Monitor className="mr-2 h-4 w-4 text-muted-foreground" />
          )}
          Theme: {theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4 text-muted-foreground" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
