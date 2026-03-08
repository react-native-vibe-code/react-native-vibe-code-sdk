import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { db, user, emailPreferences, newsletterSends, eq, sql } from '@/lib/db'
import { sendNewsletter } from '@/lib/email'
import { getTemplate } from '@/lib/email/templates/registry'

export async function POST(request: NextRequest) {
  const session = await getServerSession()
  const adminEmail = process.env.ADMIN_EMAIL

  if (!session?.user?.email || !adminEmail || session.user.email !== adminEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { templateName } = body

  if (!templateName) {
    return NextResponse.json({ error: 'templateName is required' }, { status: 400 })
  }

  const template = getTemplate(templateName)
  if (!template) {
    return NextResponse.json({ error: `Template "${templateName}" not found` }, { status: 404 })
  }

  try {
    // Get all subscribed users
    // Users are subscribed by default (no emailPreferences record = subscribed)
    // Only exclude users who have explicitly unsubscribed
    const subscribedUsers = await db
      .select({ email: user.email })
      .from(user)
      .leftJoin(emailPreferences, eq(user.id, emailPreferences.userId))
      .where(
        sql`${emailPreferences.subscribedToNewsletter} IS NULL OR ${emailPreferences.subscribedToNewsletter} = true`
      )

    const recipients = subscribedUsers.map((u) => u.email)

    if (recipients.length === 0) {
      return NextResponse.json({ error: 'No subscribed recipients found' }, { status: 400 })
    }

    // Send the newsletter
    await sendNewsletter(recipients, {
      subject: template.subject,
      issueNumber: template.issueNumber,
      issueDate: template.issueDate,
    })

    // Record the send
    await db.insert(newsletterSends).values({
      templateName: template.name,
      subject: template.subject,
      recipientCount: recipients.length,
      sentBy: session.user.id,
    })

    return NextResponse.json({
      success: true,
      recipientCount: recipients.length,
      templateName: template.name,
    })
  } catch (error) {
    console.error('[Email Admin] Send error:', error)
    return NextResponse.json(
      { error: 'Failed to send newsletter' },
      { status: 500 }
    )
  }
}
