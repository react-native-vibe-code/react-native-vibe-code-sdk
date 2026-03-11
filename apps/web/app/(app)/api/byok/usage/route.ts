import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getUserSandboxUsage } from '@react-native-vibe-code/byok'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const usage = await getUserSandboxUsage(session.user.id)
  return NextResponse.json(usage)
}
