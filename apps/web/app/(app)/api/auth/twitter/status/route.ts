import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth/index'
import { db } from '@/lib/db'
import { twitterLinks } from '@react-native-vibe-code/database'
import { eq } from 'drizzle-orm'

export async function GET() {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const twitterLink = await db
      .select()
      .from(twitterLinks)
      .where(eq(twitterLinks.userId, session.user.id))
      .limit(1)

    if (twitterLink.length === 0) {
      return NextResponse.json({ linked: false })
    }

    return NextResponse.json({
      linked: true,
      twitterUsername: twitterLink[0].twitterUsername,
      linkedAt: twitterLink[0].linkedAt?.toISOString() || null,
    })
  } catch (error) {
    console.error('Twitter status error:', error)
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 })
  }
}
