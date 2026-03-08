'use client'

import { useState, useEffect } from 'react'

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

  useEffect(() => {
    fetchHistory()
  }, [])

  async function fetchHistory() {
    const res = await fetch('/api/email-admin/history')
    if (res.ok) {
      const data = await res.json()
      setSends(data)
    }
  }

  async function handleSend() {
    if (!selectedTemplate) return
    if (!confirm(`Send "${selectedTemplate}" to all subscribed users? This cannot be undone.`)) return

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
        setMessage({ type: 'success', text: `Newsletter sent to ${data.recipientCount} recipients!` })
        fetchHistory()
        setSelectedTemplate('')
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to send' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' })
    } finally {
      setSending(false)
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

        <button
          onClick={handleSend}
          disabled={!selectedTemplate || sending}
          className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
        >
          {sending ? 'Sending...' : 'Send to All Subscribers'}
        </button>
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
