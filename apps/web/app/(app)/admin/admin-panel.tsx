'use client'

import { useState } from 'react'

// Files that make up the floating chat component in the sandbox
const FLOATING_CHAT_FILES = [
  'features/floating-chat/index.ts',
  'features/floating-chat/FloatingChatWrapper.tsx',
  'features/floating-chat/ChatScreen.tsx',
  'features/floating-chat/DraggableFloatingButton.tsx',
  'features/floating-chat/components/ClaudeCodeMessage.tsx',
  'features/floating-chat/lib/api.ts',
  'features/floating-chat/lib/polyfills.ts',
  'features/floating-chat/utils/animation-helpers.ts',
  'app/_layout.tsx',
]

interface FileResult {
  file: string
  status: 'pending' | 'uploading' | 'success' | 'error' | 'skipped'
  message?: string
}

export function AdminPanel() {
  const [projectId, setProjectId] = useState('')
  const [results, setResults] = useState<FileResult[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [overallStatus, setOverallStatus] = useState<string>('')

  const updateChatComponent = async () => {
    if (!projectId.trim()) return

    setIsRunning(true)
    setOverallStatus('Reading local files...')
    setResults(FLOATING_CHAT_FILES.map(f => ({ file: f, status: 'pending' })))

    const fileResults: FileResult[] = []

    for (const filePath of FLOATING_CHAT_FILES) {
      setOverallStatus(`Uploading ${filePath}...`)

      // Update this file's status to uploading
      setResults(prev =>
        prev.map(r => r.file === filePath ? { ...r, status: 'uploading' } : r)
      )

      try {
        // Read the file content from the local filesystem via a dedicated API
        const readRes = await fetch('/api/admin/read-local-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath }),
        })

        if (!readRes.ok) {
          const err = await readRes.json()
          fileResults.push({ file: filePath, status: 'error', message: err.error || 'Failed to read' })
          setResults(prev =>
            prev.map(r => r.file === filePath ? { ...r, status: 'error', message: err.error } : r)
          )
          continue
        }

        const { content } = await readRes.json()

        // Push to sandbox via sandbox-edit
        const editRes = await fetch('/api/sandbox-edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: projectId.trim(),
            filePath,
            content,
          }),
        })

        if (!editRes.ok) {
          const err = await editRes.json()
          fileResults.push({ file: filePath, status: 'error', message: err.error || 'Failed to write' })
          setResults(prev =>
            prev.map(r => r.file === filePath ? { ...r, status: 'error', message: err.error } : r)
          )
        } else {
          fileResults.push({ file: filePath, status: 'success' })
          setResults(prev =>
            prev.map(r => r.file === filePath ? { ...r, status: 'success' } : r)
          )
        }
      } catch (err: any) {
        fileResults.push({ file: filePath, status: 'error', message: err.message })
        setResults(prev =>
          prev.map(r => r.file === filePath ? { ...r, status: 'error', message: err.message } : r)
        )
      }
    }

    const succeeded = fileResults.filter(r => r.status === 'success').length
    const failed = fileResults.filter(r => r.status === 'error').length
    setOverallStatus(`Done. ${succeeded} files updated, ${failed} failed.`)
    setIsRunning(false)
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <p className="text-muted-foreground mt-1">Push local code changes to running sandboxes</p>
      </div>

      {/* Update Chat Component */}
      <div className="border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold">Update Chat Component</h2>
        <p className="text-sm text-muted-foreground">
          Push the local floating-chat files to a running sandbox. This reads from
          your local <code className="bg-muted px-1 rounded">packages/sandbox/local-expo-app/</code> and
          writes to the sandbox via <code className="bg-muted px-1 rounded">/api/sandbox-edit</code>.
        </p>

        <div className="flex gap-3">
          <input
            type="text"
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            placeholder="Project ID (e.g. a691963a-...)"
            className="flex-1 px-3 py-2 border rounded-md bg-background text-sm font-mono"
          />
          <button
            onClick={updateChatComponent}
            disabled={isRunning || !projectId.trim()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50 whitespace-nowrap"
          >
            {isRunning ? 'Pushing...' : 'Update Chat Component'}
          </button>
        </div>

        {overallStatus && (
          <p className="text-sm font-medium">{overallStatus}</p>
        )}

        {results.length > 0 && (
          <div className="border rounded-md divide-y text-sm">
            {results.map(r => (
              <div key={r.file} className="flex items-center gap-3 px-3 py-2">
                <span className="w-5 text-center">
                  {r.status === 'pending' && <span className="text-muted-foreground">-</span>}
                  {r.status === 'uploading' && <span className="animate-spin">&#9696;</span>}
                  {r.status === 'success' && <span className="text-green-600">&#10003;</span>}
                  {r.status === 'error' && <span className="text-red-600">&#10007;</span>}
                  {r.status === 'skipped' && <span className="text-yellow-600">&#8212;</span>}
                </span>
                <code className="flex-1 text-xs">{r.file}</code>
                {r.message && (
                  <span className="text-xs text-red-600 max-w-[200px] truncate">{r.message}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
