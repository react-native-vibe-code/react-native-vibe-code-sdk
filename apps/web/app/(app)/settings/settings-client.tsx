'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface SettingsClientProps {
  linkedTwitter: {
    twitterUsername: string
    linkedAt: string | null
  } | null
  successMessage?: string
  errorMessage?: string
  user: {
    name: string
    email: string
    image: string | null
  }
}

export function SettingsClient({
  linkedTwitter,
  successMessage,
  errorMessage,
  user,
}: SettingsClientProps) {
  const router = useRouter()
  const [isUnlinking, setIsUnlinking] = useState(false)
  const [showSuccess, setShowSuccess] = useState(!!successMessage)
  const [showError, setShowError] = useState(!!errorMessage)

  // Auto-hide messages after 5 seconds
  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => setShowSuccess(false), 5000)
      return () => clearTimeout(timer)
    }
  }, [showSuccess])

  useEffect(() => {
    if (showError) {
      const timer = setTimeout(() => setShowError(false), 5000)
      return () => clearTimeout(timer)
    }
  }, [showError])

  const handleLinkTwitter = () => {
    window.location.href = '/api/auth/twitter/link'
  }

  const handleUnlinkTwitter = async () => {
    setIsUnlinking(true)
    try {
      const response = await fetch('/api/auth/twitter/unlink', {
        method: 'POST',
      })

      if (response.ok) {
        router.refresh()
      } else {
        setShowError(true)
      }
    } catch (error) {
      console.error('Unlink error:', error)
      setShowError(true)
    } finally {
      setIsUnlinking(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Success/Error Messages */}
      {showSuccess && successMessage && (
        <div className="bg-green-500/10 border border-green-500/20 text-green-500 px-4 py-3 rounded-lg">
          {successMessage}
        </div>
      )}

      {showError && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-lg">
          {errorMessage || 'An error occurred'}
        </div>
      )}

      {/* Account Info */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={user.image || undefined} alt={user.name} />
              <AvatarFallback>{user.name.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{user.name}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Twitter Linking */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            X (Twitter) Account
          </CardTitle>
          <CardDescription>
            Link your X account to create apps by mentioning @rnvibecode
          </CardDescription>
        </CardHeader>
        <CardContent>
          {linkedTwitter ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-black rounded-full flex items-center justify-center">
                    <svg
                      className="h-5 w-5 text-white"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium">@{linkedTwitter.twitterUsername}</p>
                    <p className="text-sm text-muted-foreground">
                      Linked{' '}
                      {linkedTwitter.linkedAt
                        ? new Date(linkedTwitter.linkedAt).toLocaleDateString()
                        : 'recently'}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={handleUnlinkTwitter}
                  disabled={isUnlinking}
                >
                  {isUnlinking ? 'Unlinking...' : 'Unlink'}
                </Button>
              </div>

              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-2">How it works:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Tweet at @rnvibecode with your app idea</li>
                  <li>Include images for design reference (optional)</li>
                  <li>Our AI will create your app and reply with the link</li>
                </ol>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Connect your X account to create mobile apps by simply tweeting at
                @rnvibecode. Share your app idea and we&apos;ll build it for you!
              </p>

              <Button onClick={handleLinkTwitter} className="w-full sm:w-auto">
                <svg
                  className="h-4 w-4 mr-2"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                Link X Account
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Back to Home */}
      <div className="pt-4">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back to Home
        </Link>
      </div>
    </div>
  )
}
