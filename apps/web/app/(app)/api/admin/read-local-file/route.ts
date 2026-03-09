import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth/index'
import { readFile } from 'fs/promises'
import path from 'path'

export async function POST(req: Request) {
  // Admin auth check
  const session = await getServerSession()
  const adminEmail = process.env.ADMIN_EMAIL

  if (!session?.user?.email || !adminEmail || session.user.email !== adminEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { filePath } = await req.json()

  if (!filePath || typeof filePath !== 'string') {
    return NextResponse.json({ error: 'filePath is required' }, { status: 400 })
  }

  // Only allow reading from the local-expo-app directory
  const basePath = path.resolve(process.cwd(), '../../packages/sandbox/local-expo-app')
  const fullPath = path.resolve(basePath, filePath)

  // Prevent path traversal
  if (!fullPath.startsWith(basePath)) {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 })
  }

  try {
    const content = await readFile(fullPath, 'utf-8')
    return NextResponse.json({ content })
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return NextResponse.json({ error: `File not found: ${filePath}` }, { status: 404 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
