import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/index'
import { db } from '@/lib/db'
import { twitterLinks } from '@react-native-vibe-code/database'
import { eq } from 'drizzle-orm'
import { SettingsClient } from './settings-client'

export const dynamic = 'force-dynamic'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>
}) {
  const session = await getServerSession()

  if (!session?.user?.id) {
    redirect('/')
  }

  // Fetch user's Twitter link
  const twitterLink = await db
    .select()
    .from(twitterLinks)
    .where(eq(twitterLinks.userId, session.user.id))
    .limit(1)

  const linkedTwitter = twitterLink.length > 0 ? twitterLink[0] : null
  const params = await searchParams

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-2xl py-8 px-4">
        <h1 className="text-2xl font-bold mb-8">Settings</h1>

        <SettingsClient
          linkedTwitter={
            linkedTwitter
              ? {
                  twitterUsername: linkedTwitter.twitterUsername,
                  linkedAt: linkedTwitter.linkedAt?.toISOString() || null,
                }
              : null
          }
          successMessage={params.success}
          errorMessage={params.error}
          user={{
            name: session.user.name || '',
            email: session.user.email || '',
            image: session.user.image || null,
          }}
        />
      </div>
    </div>
  )
}
