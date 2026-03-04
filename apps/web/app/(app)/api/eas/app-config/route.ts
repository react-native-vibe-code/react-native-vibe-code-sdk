import { NextRequest, NextResponse } from 'next/server'
import { connectSandbox } from '@/lib/sandbox-connect'

export async function GET(request: NextRequest) {
  const sandboxId = request.nextUrl.searchParams.get('sandboxId')

  if (!sandboxId) {
    return NextResponse.json(
      { error: 'sandboxId is required' },
      { status: 400 }
    )
  }

  try {
    const sbx = await connectSandbox(sandboxId)
    if (!sbx) {
      return NextResponse.json(
        { error: 'Failed to connect to sandbox' },
        { status: 500 }
      )
    }

    const result = await sbx.commands.run('cat /home/user/app/app.json', {
      timeoutMs: 5000,
    })

    if (result.exitCode !== 0) {
      return NextResponse.json(
        { error: 'Failed to read app.json' },
        { status: 500 }
      )
    }

    const appConfig = JSON.parse(result.stdout)
    const expo = appConfig.expo || {}

    return NextResponse.json({
      name: expo.name || '',
      slug: expo.slug || '',
      bundleIdentifier: expo.ios?.bundleIdentifier || '',
      androidPackage: expo.android?.package || '',
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to read app config' },
      { status: 500 }
    )
  }
}
