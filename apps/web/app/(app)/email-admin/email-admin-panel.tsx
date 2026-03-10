'use client'

import { useState, useEffect, useCallback } from 'react'

interface NewsletterSend {
  id: string
  templateName: string
  subject: string
  recipientCount: number
  sentAt: string
}

interface UploadedImage {
  url: string
  name: string
}

interface SendStatus {
  templateName: string
  totalSubscribed: number
  sentCount: number
  pendingCount: number
  sent: { email: string; sentAt: string }[]
  pending: { email: string; name: string }[]
  quotaRemaining: number
  sentInLast24h: number
  nextAvailable: string | null
}

const NEWSLETTER_TEMPLATES = [
  { name: 'newsletter_1', subject: "What's New at React Native Vibe Code", issueNumber: 1, issueDate: 'March 2026' },
]

export function EmailAdminPanel() {
  const [sends, setSends] = useState<NewsletterSend[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([])
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const [testEmail, setTestEmail] = useState('rodrigofigueroa.name@gmail.com')
  const [sendingTest, setSendingTest] = useState(false)
  const [status, setStatus] = useState<SendStatus | null>(null)
  const [showWelcome, setShowWelcome] = useState(false)

  useEffect(() => {
    fetchHistory()
  }, [])

  const fetchStatus = useCallback(async (template: string) => {
    const res = await fetch(`/api/email-admin/status?template=${template}`)
    if (res.ok) {
      const data = await res.json()
      setStatus(data)
    }
  }, [])

  useEffect(() => {
    if (selectedTemplate) {
      fetchStatus(selectedTemplate)
    } else {
      setStatus(null)
    }
  }, [selectedTemplate, fetchStatus])

  async function fetchHistory() {
    const res = await fetch('/api/email-admin/history')
    if (res.ok) {
      const data = await res.json()
      setSends(data)
    }
  }

  async function handleSend() {
    if (!selectedTemplate) return
    const pendingCount = status?.pendingCount || 0
    const quota = status?.quotaRemaining || 0
    const willSend = Math.min(pendingCount, quota)

    if (!confirm(`Send "${selectedTemplate}" to ${willSend} users (of ${pendingCount} pending)? Daily quota: ${quota} remaining.`)) return

    setSending(true)
    setMessage(null)

    try {
      const res = await fetch('/api/email-admin/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateName: selectedTemplate }),
      })
      const data = await res.json()

      if (res.ok) {
        setMessage({
          type: 'success',
          text: `Sent to ${data.sentCount} users. ${data.remainingUsers} still pending. Quota remaining: ${data.quotaRemaining}`,
        })
        fetchHistory()
        fetchStatus(selectedTemplate)
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to send' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' })
    } finally {
      setSending(false)
    }
  }

  async function handleSendTest() {
    if (!selectedTemplate || !testEmail) return

    setSendingTest(true)
    setMessage(null)

    try {
      const res = await fetch('/api/email-admin/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateName: selectedTemplate, testEmail }),
      })
      const data = await res.json()

      if (res.ok) {
        setMessage({ type: 'success', text: `Test email sent to ${testEmail}` })
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to send test' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' })
    } finally {
      setSendingTest(false)
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/email-admin/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (res.ok) {
        setUploadedImages((prev) => [{ url: data.url, name: file.name }, ...prev])
      } else {
        setMessage({ type: 'error', text: data.error || 'Upload failed' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Upload failed' })
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url)
    setCopiedUrl(url)
    setTimeout(() => setCopiedUrl(null), 2000)
  }

  const canSend = status && status.pendingCount > 0 && status.quotaRemaining > 0

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Email Admin</h1>
        <p className="text-muted-foreground mt-1">Manage and send newsletters</p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Send Newsletter */}
      <section className="border rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-semibold">Send Newsletter</h2>

        <div className="space-y-3">
          <label className="text-sm font-medium">Select Template</label>
          <div className="grid gap-3">
            {NEWSLETTER_TEMPLATES.map((t) => (
              <label
                key={t.name}
                className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                  selectedTemplate === t.name
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <input
                  type="radio"
                  name="template"
                  value={t.name}
                  checked={selectedTemplate === t.name}
                  onChange={() => setSelectedTemplate(t.name)}
                  className="sr-only"
                />
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  selectedTemplate === t.name ? 'border-primary' : 'border-muted-foreground/30'
                }`}>
                  {selectedTemplate === t.name && (
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  )}
                </div>
                <div>
                  <div className="font-medium">{t.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {t.subject} — Issue #{t.issueNumber}, {t.issueDate}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Send Status */}
        {status && selectedTemplate && (
          <div className="space-y-4">
            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">
                  Progress: {status.sentCount} / {status.totalSubscribed} sent
                </span>
                <span className="text-muted-foreground">
                  {status.pendingCount} pending
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2.5">
                <div
                  className="bg-primary h-2.5 rounded-full transition-all"
                  style={{
                    width: `${status.totalSubscribed > 0 ? (status.sentCount / status.totalSubscribed) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {/* Quota info */}
            <div className="flex gap-4 text-sm">
              <div className="px-3 py-1.5 bg-muted/50 rounded-md">
                Daily quota: <span className="font-medium">{status.quotaRemaining}</span> / 100 remaining
              </div>
              <div className="px-3 py-1.5 bg-muted/50 rounded-md">
                Sent last 24h: <span className="font-medium">{status.sentInLast24h}</span>
              </div>
              {status.nextAvailable && (
                <div className="px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-md">
                  Next batch available: {new Date(status.nextAvailable).toLocaleString()}
                </div>
              )}
            </div>

            {/* Sent / Pending lists */}
            <div className="grid grid-cols-2 gap-4">
              {/* Sent */}
              <div className="border rounded-lg p-4 space-y-2">
                <h3 className="text-sm font-medium text-green-700">
                  Sent ({status.sent.length})
                </h3>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {status.sent.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No emails sent yet</p>
                  ) : (
                    status.sent.map((r) => (
                      <div key={r.email} className="text-xs flex justify-between">
                        <span className="truncate">{r.email}</span>
                        <span className="text-muted-foreground shrink-0 ml-2">
                          {new Date(r.sentAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Pending */}
              <div className="border rounded-lg p-4 space-y-2">
                <h3 className="text-sm font-medium text-amber-700">
                  Pending ({status.pending.length})
                </h3>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {status.pending.length === 0 ? (
                    <p className="text-xs text-muted-foreground">All users have received this newsletter</p>
                  ) : (
                    status.pending.map((u) => (
                      <div key={u.email} className="text-xs truncate">
                        {u.email}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedTemplate && (
          <div className="space-y-3">
            <label className="text-sm font-medium">Preview</label>
            <iframe
              src={`/api/email-preview?template=${selectedTemplate}`}
              className="w-full h-[600px] border rounded-lg"
              title="Email Preview"
            />
          </div>
        )}

        {selectedTemplate && (
          <div className="flex items-end gap-3 p-4 bg-muted/50 rounded-lg">
            <div className="flex-1 space-y-1.5">
              <label className="text-sm font-medium">Send Test Email</label>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@example.com"
                className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <button
              onClick={handleSendTest}
              disabled={!testEmail || sendingTest}
              className="px-4 py-2 text-sm bg-secondary text-secondary-foreground rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-secondary/80 transition-colors shrink-0"
            >
              {sendingTest ? 'Sending...' : 'Send Test'}
            </button>
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={!selectedTemplate || sending || !canSend}
          className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
        >
          {sending
            ? 'Sending...'
            : status && status.quotaRemaining === 0
              ? 'Daily Quota Reached'
              : status && status.pendingCount === 0
                ? 'All Users Sent'
                : `Send Batch (up to ${Math.min(status?.pendingCount || 0, status?.quotaRemaining || 100)} users)`}
        </button>
      </section>

      {/* Welcome Email Preview */}
      <section className="border rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Welcome Email</h2>
          <button
            onClick={() => setShowWelcome(!showWelcome)}
            className="px-4 py-2 text-sm bg-secondary text-secondary-foreground rounded-md font-medium hover:bg-secondary/80 transition-colors"
          >
            {showWelcome ? 'Hide Preview' : 'Show Preview'}
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Sent automatically when a new user signs up.
        </p>
        {showWelcome && (
          <iframe
            src="/api/email-preview?template=welcome"
            className="w-full h-[600px] border rounded-lg"
            title="Welcome Email Preview"
          />
        )}
      </section>

      {/* Image Upload */}
      <section className="border rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-semibold">Newsletter Images</h2>
        <p className="text-sm text-muted-foreground">
          Upload images for use in email templates. Copy the URL to use in your newsletter code.
        </p>

        <div>
          <label className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg font-medium cursor-pointer hover:bg-secondary/80 transition-colors">
            {uploading ? 'Uploading...' : 'Upload Image'}
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              disabled={uploading}
              className="sr-only"
            />
          </label>
        </div>

        {uploadedImages.length > 0 && (
          <div className="grid gap-3">
            {uploadedImages.map((img) => (
              <div
                key={img.url}
                className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
              >
                <img src={img.url} alt={img.name} className="w-12 h-12 object-cover rounded" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{img.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{img.url}</div>
                </div>
                <button
                  onClick={() => copyUrl(img.url)}
                  className="px-3 py-1.5 text-xs bg-secondary rounded-md hover:bg-secondary/80 transition-colors shrink-0"
                >
                  {copiedUrl === img.url ? 'Copied!' : 'Copy URL'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Send History */}
      <section className="border rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-semibold">Send History</h2>

        {sends.length === 0 ? (
          <p className="text-sm text-muted-foreground">No newsletters sent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium">Template</th>
                  <th className="text-left py-3 px-2 font-medium">Subject</th>
                  <th className="text-left py-3 px-2 font-medium">Recipients</th>
                  <th className="text-left py-3 px-2 font-medium">Sent</th>
                </tr>
              </thead>
              <tbody>
                {sends.map((send) => (
                  <tr key={send.id} className="border-b last:border-0">
                    <td className="py-3 px-2 font-mono text-xs">{send.templateName}</td>
                    <td className="py-3 px-2">{send.subject}</td>
                    <td className="py-3 px-2">{send.recipientCount}</td>
                    <td className="py-3 px-2 text-muted-foreground">
                      {new Date(send.sentAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
