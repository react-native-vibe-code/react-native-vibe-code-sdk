import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { cookies } from 'next/headers'
import { headers } from 'next/headers'
import { getServerSession } from '@/lib/auth/index'

export async function GET() {
  // Check if user is logged in
  const session = await getServerSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const clientId = process.env.TWITTER_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'TWITTER_CLIENT_ID not set' }, { status: 500 })
  }

  // Generate PKCE code verifier and challenge
  const codeVerifier = crypto.randomBytes(32).toString('base64url')
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')

  // Store verifier and userId in cookies
  const cookieStore = await cookies()
  cookieStore.set('twitter_link_code_verifier', codeVerifier, {
    httpOnly: true,
    path: '/',
    maxAge: 60 * 10, // 10 min
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })
  cookieStore.set('twitter_link_user_id', session.user.id, {
    httpOnly: true,
    path: '/',
    maxAge: 60 * 10, // 10 min
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })

  // Get the current host dynamically
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3210'
  const protocol = host.includes('localhost') ? 'http' : 'https'
  const redirectUri = `${protocol}://${host}/api/auth/twitter/callback`

  // Only need read scopes for account linking (not tweet.write)
  const scopes = 'tweet.read users.read'
  const state = crypto.randomBytes(16).toString('hex')

  // Store state for CSRF protection
  cookieStore.set('twitter_link_state', state, {
    httpOnly: true,
    path: '/',
    maxAge: 60 * 10,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })

  const authUrl =
    `https://twitter.com/i/oauth2/authorize?` +
    `response_type=code&` +
    `client_id=${clientId}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `scope=${encodeURIComponent(scopes)}&` +
    `state=${state}&` +
    `code_challenge=${codeChallenge}&` +
    `code_challenge_method=S256`

  // Redirect to Twitter OAuth
  return NextResponse.redirect(authUrl)
}
