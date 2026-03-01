import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth/index'
import { db } from '@/lib/db'
import { twitterLinks } from '@react-native-vibe-code/database'
import { eq } from 'drizzle-orm'

export async function POST() {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    await db.delete(twitterLinks).where(eq(twitterLinks.userId, session.user.id))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Unlink error:', error)
    return NextResponse.json({ error: 'Failed to unlink account' }, { status: 500 })
  }
}
