import { NextRequest, NextResponse } from 'next/server'
import { render } from '@react-email/components'
import { WelcomeEmail, NewsletterEmail } from '@/lib/email'
import { getTemplate, newsletterTemplates } from '@/lib/email/templates/registry'

const templates: Record<string, (params: URLSearchParams) => React.ReactElement> = {
  welcome: (params) =>
    WelcomeEmail({ name: params.get('name') || 'Jane Doe' }),
  newsletter: () => NewsletterEmail({}),
}

// Register all newsletter templates from the registry
for (const t of newsletterTemplates) {
  templates[t.name] = () => t.component({})
}

export async function GET(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const template = searchParams.get('template')

  // If no template specified, show an index page
  if (!template) {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Email Preview</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 600px; margin: 40px auto; padding: 0 20px; color: #333; }
            h1 { font-size: 24px; margin-bottom: 8px; }
            p { color: #666; margin-bottom: 32px; }
            a { display: block; padding: 12px 16px; margin: 8px 0; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; color: #111; text-decoration: none; font-weight: 500; }
            a:hover { background: #f3f4f6; border-color: #d1d5db; }
            span { color: #888; font-weight: 400; font-size: 14px; }
          </style>
        </head>
        <body>
          <h1>Email Templates</h1>
          <p>Click a template to preview it in the browser.</p>
          <a href="/api/email-preview?template=welcome">Welcome Email <span>— sent when a user signs up</span></a>
          <a href="/api/email-preview?template=newsletter">Newsletter (latest) <span>— weekly updates email</span></a>
          ${newsletterTemplates.map((t) => `<a href="/api/email-preview?template=${t.name}">${t.name} <span>— ${t.subject} (${t.issueDate})</span></a>`).join('\n          ')}
        </body>
      </html>
    `
    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const templateFn = templates[template]
  if (!templateFn) {
    return NextResponse.json(
      { error: `Unknown template: ${template}. Available: ${Object.keys(templates).join(', ')}` },
      { status: 400 }
    )
  }

  const element = templateFn(searchParams)
  const html = await render(element)

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  })
}
