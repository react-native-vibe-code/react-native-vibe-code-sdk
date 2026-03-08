import { NextRequest, NextResponse } from 'next/server'
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe'
import { db, user, eq, emailPreferences } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')
  const token = searchParams.get('token')

  if (!email || !token) {
    return new NextResponse(renderPage('Invalid unsubscribe link.', false), {
      headers: { 'Content-Type': 'text/html' },
      status: 400,
    })
  }

  if (!verifyUnsubscribeToken(email, token)) {
    return new NextResponse(renderPage('Invalid or expired unsubscribe link.', false), {
      headers: { 'Content-Type': 'text/html' },
      status: 400,
    })
  }

  try {
    // Find user by email
    const users = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1)

    if (users.length === 0) {
      return new NextResponse(renderPage('Email not found.', false), {
        headers: { 'Content-Type': 'text/html' },
        status: 404,
      })
    }

    // Upsert email preferences
    await db
      .insert(emailPreferences)
      .values({
        userId: users[0].id,
        subscribedToNewsletter: false,
        unsubscribedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: emailPreferences.userId,
        set: {
          subscribedToNewsletter: false,
          unsubscribedAt: new Date(),
          updatedAt: new Date(),
        },
      })

    return new NextResponse(renderPage("You've been unsubscribed from our newsletter.", true), {
      headers: { 'Content-Type': 'text/html' },
    })
  } catch (error) {
    console.error('[Unsubscribe] Error:', error)
    return new NextResponse(renderPage('Something went wrong. Please try again.', false), {
      headers: { 'Content-Type': 'text/html' },
      status: 500,
    })
  }
}

function renderPage(message: string, success: boolean): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <title>${success ? 'Unsubscribed' : 'Error'} - React Native Vibe Code</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        margin: 0;
        background: #f6f9fc;
        color: #333;
      }
      .card {
        background: white;
        border-radius: 12px;
        padding: 48px;
        max-width: 480px;
        text-align: center;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }
      h1 { font-size: 24px; margin: 0 0 16px; color: ${success ? '#1a1a1a' : '#dc2626'}; }
      p { font-size: 16px; color: #666; line-height: 24px; margin: 0 0 24px; }
      a {
        display: inline-block;
        padding: 12px 24px;
        background: #000;
        color: white;
        text-decoration: none;
        border-radius: 6px;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${success ? 'Unsubscribed' : 'Oops'}</h1>
      <p>${message}</p>
      <a href="https://reactnativevibecode.com">Go to React Native Vibe Code</a>
    </div>
  </body>
</html>`
}
