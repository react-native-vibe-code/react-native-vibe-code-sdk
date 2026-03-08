import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { db, newsletterSends, desc } from '@/lib/db'

export async function GET() {
  const session = await getServerSession()
  const adminEmail = process.env.ADMIN_EMAIL

  if (!session?.user?.email || !adminEmail || session.user.email !== adminEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sends = await db
    .select()
    .from(newsletterSends)
    .orderBy(desc(newsletterSends.sentAt))

  return NextResponse.json(sends)
}
