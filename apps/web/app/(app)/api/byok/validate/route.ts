import { NextRequest, NextResponse } from 'next/server'
import { validateAnthropicKey } from '@react-native-vibe-code/byok'

export async function POST(req: NextRequest) {
  const { key } = await req.json()

  if (!key || typeof key !== 'string') {
    return NextResponse.json({ valid: false, error: 'Key is required' }, { status: 400 })
  }

  const result = await validateAnthropicKey(key)
  return NextResponse.json(result)
}
