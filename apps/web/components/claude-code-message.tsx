import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CollapsibleCard } from '@/components/ui/card'
import {
  Bot,
  Terminal,
  FileText,
  Code,
  CheckCircle,
  AlertTriangle,
  Play,
  Settings,
  Eye,
  Edit,
  Search,
  Clock,
  ListTodo,
  Cog,
  Sparkles,
} from 'lucide-react'
import Markdown from 'react-markdown'
import { memo, useMemo } from 'react'

interface ClaudeCodeMessageProps {
  content: string
  isStreaming?: boolean
  isLastCard?: boolean
}

// Helper function to try parsing JSON content
function tryParseJSON(content: string) {
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

// Helper function to split concatenated JSON objects
function splitJSONObjects(text: string): any[] {
  const objects: any[] = []
  let depth = 0
  let start = 0

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) start = i
      depth++
    } else if (text[i] === '}') {
      depth--
      if (depth === 0) {
        const jsonStr = text.slice(start, i + 1)
        const parsed = tryParseJSON(jsonStr)
        if (parsed) objects.push(parsed)
      }
    }
  }

  return objects
}

// Helper function to extract Claude message data from formatted content
function extractClaudeMessages(content: string) {
  // Remove the "📝 Message X:" prefix
  const cleanContent = content.replace(/^📝 Message \d+:\s*/, '')

  // Check if content contains multiple newline-separated JSON objects
  const lines = cleanContent.split('\n').filter(line => line.trim())
  const messages: any[] = []

  for (const line of lines) {
    const trimmedLine = line.trim()

    // Try to parse each line as JSON
    if (trimmedLine.startsWith('{') && trimmedLine.endsWith('}')) {
      const parsed = tryParseJSON(trimmedLine)
      if (parsed && parsed.type) {
        messages.push(parsed)
        continue
      }
    }

    // If not parseable as structured JSON, treat as raw content
    if (trimmedLine && !trimmedLine.startsWith('{')) {
      messages.push({ rawContent: trimmedLine })
    }
  }

  // If we found messages, return them
  if (messages.length > 0) {
    return messages
  }

  // Fallback: Try to parse as single JSON object
  if (cleanContent.trim().startsWith('{')) {
    const cleanedForParsing = cleanContent.trim().replace(/\\n$/g, '')
    const parsed = tryParseJSON(cleanedForParsing)
    if (parsed) {
      return [parsed]
    }
    // Try to extract multiple JSON objects
    const splitObjects = splitJSONObjects(cleanContent)
    if (splitObjects.length > 0) {
      return splitObjects
    }
  }

  // Look for "Streaming: {content}" format
  const streamingMatch = content.match(/Streaming:\s*(.+)/)
  if (streamingMatch) {
    const streamContent = streamingMatch[1].trim()

    // Try to parse streaming content as JSON
    if (streamContent.startsWith('{')) {
      const cleanedForParsing = streamContent.replace(/\\n$/g, '')
      const parsed = tryParseJSON(cleanedForParsing)
      if (parsed) {
        return [parsed]
      }
      // Try splitting multiple JSON objects
      const splitObjects = splitJSONObjects(streamContent)
      if (splitObjects.length > 0) {
        return splitObjects
      }
    }

    // Otherwise return as raw content
    return [{ rawContent: streamContent }]
  }

  // Return as raw content
  return [{ rawContent: content }]
}

const SystemInitCard = memo(function SystemInitCard({ data, isStreaming }: { data: any; isStreaming?: boolean }) {
  return (
    <CollapsibleCard
      cardClassName="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800"
      icon={<Settings className="h-4 w-4 text-blue-600" />}
      title="Session Started"
      streamingIndicator={isStreaming ? <Cog className="h-6 w-6 text-blue-600 animate-cog-spin" /> : undefined}
    >
      <div className="space-y-2 text-xs">
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary" className="text-xs">
            {data.model}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {data.cwd}
          </Badge>
        </div>
        <div className="text-muted-foreground">
          {data.tools?.length} tools available • Session:{' '}
          {data.session_id?.slice(0, 8)}...
        </div>
      </div>
    </CollapsibleCard>
  )
})

// Shared TodoWrite card used by both slim and legacy formats
const TodoWriteCard = memo(function TodoWriteCard({ input, isStreaming }: { input: any; isStreaming?: boolean }) {
  let todos: any[] = []

  if (input?.todos) {
    todos = input.todos
  } else if (Array.isArray(input)) {
    todos = input
  } else if (input?.content) {
    try {
      const parsed = JSON.parse(input.content)
      todos = parsed.todos || parsed
    } catch {
      todos = [{ text: input.content }]
    }
  }

  return (
    <Card className="border-indigo-200 bg-indigo-50 dark:bg-indigo-950/20 dark:border-indigo-800 relative">
      {isStreaming && (
        <div className="absolute top-4 right-4">
          <Cog className="h-6 w-6 text-indigo-600 animate-cog-spin" />
        </div>
      )}
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ListTodo className="h-4 w-4 text-indigo-600" />
          Todo List
          <Badge variant="secondary" className="text-xs ml-auto">
            {todos.filter((t: any) => t.status === 'completed').length}/{todos.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {todos.length > 0 ? (
            todos.map((todo: any, index: number) => {
              const isCompleted = todo.status === 'completed'
              const isInProgress = todo.status === 'in_progress'

              return (
                <div
                  key={index}
                  className={`flex items-start gap-2 p-2 rounded border ${
                    isCompleted
                      ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800'
                      : isInProgress
                      ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800'
                      : 'bg-background/50 border-border'
                  }`}
                >
                  <div className="flex items-center justify-center w-5 h-5 mt-0.5">
                    {isCompleted ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : isInProgress ? (
                      <Cog className="h-4 w-4 text-blue-600 animate-cog-spin" />
                    ) : (
                      <div className="h-3 w-3 rounded-full border-2 border-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {typeof todo.content === 'string' ? todo.content : (typeof todo.content === 'object' ? JSON.stringify(todo.content) : String(todo.content))}
                    </p>
                    {todo.activeForm && isInProgress && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        {todo.activeForm}
                      </p>
                    )}
                  </div>
                  {isCompleted && (
                    <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                      Done
                    </Badge>
                  )}
                  {isInProgress && (
                    <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                      In Progress
                    </Badge>
                  )}
                </div>
              )
            })
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                No todos found in expected format
              </p>
              <div className="bg-background/50 p-2 rounded border">
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {JSON.stringify(input, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
})

// Card shown below first user message during app generation
export const GeneratingAppCard = memo(function GeneratingAppCard({ isLoading = true }: { isLoading?: boolean }) {
  return (
    <Card className="border-violet-200 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/20 dark:border-violet-800 relative overflow-hidden">
      {/* Animated background shimmer - only when loading */}
      {isLoading && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
      )}

      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <div className="relative">
            <Sparkles className="h-4 w-4 text-violet-600" />
            {isLoading && (
              <div className="absolute inset-0 animate-ping">
                <Sparkles className="h-4 w-4 text-violet-400 opacity-75" />
              </div>
            )}
          </div>
          <span className="text-violet-700 dark:text-violet-300">
            {isLoading ? "Generating your app" : "App generation started"}
          </span>
          {isLoading && (
            <div className="ml-auto">
              <Cog className="h-5 w-5 text-violet-600 animate-cog-spin" />
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          <p className="text-sm text-violet-600 dark:text-violet-400">
            {isLoading
              ? "Analyzing your request and preparing the development environment..."
              : "Your app is being built. Check the agent responses below for updates."
            }
          </p>
          {isLoading && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 bg-violet-200 dark:bg-violet-800 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full animate-progress-indeterminate" />
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
})

const AssistantMessageCard = memo(function AssistantMessageCard({ data, isStreaming }: { data: any; isStreaming?: boolean }) {
  // --- Slim format: subtype === 'text' ---
  if (data.subtype === 'text' && data.text) {
    return (
      <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 relative">
        {isStreaming && (
          <div className="absolute top-4 right-4">
            <Cog className="h-6 w-6 text-green-600 animate-cog-spin" />
          </div>
        )}
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Bot className="h-4 w-4 text-green-600" />
            Code Agent
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm">
            <Markdown>{data.text}</Markdown>
          </p>
        </CardContent>
      </Card>
    )
  }

  // --- Slim format: subtype === 'tool_use' ---
  if (data.subtype === 'tool_use' && data.tool_name) {
    const toolName = data.tool_name

    // TodoWrite: full input preserved in slim format
    if (toolName === 'TodoWrite' && data.input) {
      return <TodoWriteCard input={data.input} isStreaming={isStreaming} />
    }

    // Write / Edit — headline card
    if (toolName === 'Write' || toolName === 'Edit') {
      const label = toolName === 'Write' ? 'Writing' : 'Editing'
      return (
        <CollapsibleCard
          cardClassName="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800"
          icon={<Edit className="h-4 w-4 text-amber-600" />}
          title={<span className="font-normal">{label}: <code className="text-xs">{data.file_path || 'unknown file'}</code></span>}
          streamingIndicator={isStreaming ? <Cog className="h-6 w-6 text-amber-600 animate-cog-spin" /> : undefined}
        />
      )
    }

    // Read — headline card
    if (toolName === 'Read') {
      return (
        <CollapsibleCard
          cardClassName="border-gray-200 bg-gray-50 dark:bg-gray-950/20 dark:border-gray-800"
          icon={<Eye className="h-4 w-4 text-gray-600" />}
          title={<span className="font-normal">Reading: <code className="text-xs">{data.file_path || 'unknown file'}</code></span>}
          streamingIndicator={isStreaming ? <Cog className="h-6 w-6 text-gray-600 animate-cog-spin" /> : undefined}
        />
      )
    }

    // Glob / Grep — headline card
    if (toolName === 'Glob' || toolName === 'Grep') {
      return (
        <CollapsibleCard
          cardClassName="border-purple-200 bg-purple-50 dark:bg-purple-950/20 dark:border-purple-800"
          icon={<Search className="h-4 w-4 text-purple-600" />}
          title={<span className="font-normal">{toolName}: <code className="text-xs">{data.pattern || '...'}</code></span>}
          streamingIndicator={isStreaming ? <Cog className="h-6 w-6 text-purple-600 animate-cog-spin" /> : undefined}
        />
      )
    }

    // Bash — headline card with command preview
    if (toolName === 'Bash') {
      return (
        <CollapsibleCard
          cardClassName="border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800"
          icon={<Terminal className="h-4 w-4 text-orange-600" />}
          title={<span className="font-normal">Running: <code className="text-xs">{data.command_preview || '...'}</code></span>}
          streamingIndicator={isStreaming ? <Cog className="h-6 w-6 text-orange-600 animate-cog-spin" /> : undefined}
        />
      )
    }

    // Other tools — generic headline
    return (
      <CollapsibleCard
        cardClassName="border-purple-200 bg-purple-50 dark:bg-purple-950/20 dark:border-purple-800"
        icon={<Play className="h-4 w-4 text-purple-600" />}
        title={`Using Tool: ${toolName}`}
        streamingIndicator={isStreaming ? <Cog className="h-6 w-6 text-purple-600 animate-cog-spin" /> : undefined}
      />
    )
  }

  // --- Legacy format: message.content array ---
  const message = data.message || data
  const textContent =
    message.content?.find((c: any) => c.type === 'text')?.text || ''
  const toolUse = message.content?.find((c: any) => c.type === 'tool_use')

  if (toolUse) {
    // Special handling for TodoWrite tool
    if (toolUse.name === 'TodoWrite') {
      return <TodoWriteCard input={toolUse.input} isStreaming={isStreaming} />
    }

    // Special handling for Write tool
    if (toolUse.name === 'Write') {
      const filePath = toolUse.input?.file_path || 'unknown file'
      return (
        <CollapsibleCard
          cardClassName="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800"
          icon={<Edit className="h-4 w-4 text-amber-600" />}
          title={<span className="font-normal">Writing: <code className="text-xs">{filePath}</code></span>}
          streamingIndicator={isStreaming ? <Cog className="h-6 w-6 text-amber-600 animate-cog-spin" /> : undefined}
        >
          <div className="space-y-2 text-xs">
            {toolUse.input && (
              <div className="bg-background/50 p-2 rounded border">
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {typeof toolUse.input === 'string'
                    ? toolUse.input
                    : JSON.stringify(toolUse.input, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </CollapsibleCard>
      )
    }

    // Special handling for Edit tool
    if (toolUse.name === 'Edit') {
      const filePath = toolUse.input?.file_path || 'unknown file'
      return (
        <CollapsibleCard
          cardClassName="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800"
          icon={<Edit className="h-4 w-4 text-amber-600" />}
          title={<span className="font-normal">Editing: <code className="text-xs">{filePath}</code></span>}
          streamingIndicator={isStreaming ? <Cog className="h-6 w-6 text-amber-600 animate-cog-spin" /> : undefined}
        >
          <div className="space-y-2 text-xs">
            {toolUse.input && (
              <div className="bg-background/50 p-2 rounded border">
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {typeof toolUse.input === 'string'
                    ? toolUse.input
                    : JSON.stringify(toolUse.input, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </CollapsibleCard>
      )
    }

    // Default tool use UI
    return (
      <CollapsibleCard
        cardClassName="border-purple-200 bg-purple-50 dark:bg-purple-950/20 dark:border-purple-800"
        icon={<Play className="h-4 w-4 text-purple-600" />}
        title={`Using Tool: ${toolUse.name}`}
        streamingIndicator={isStreaming ? <Cog className="h-6 w-6 text-purple-600 animate-cog-spin" /> : undefined}
      >
        <div className="space-y-2 text-xs">
          {toolUse.input && (
            <div className="bg-background/50 p-2 rounded border">
              <pre className="text-xs font-mono whitespace-pre-wrap">
                {typeof toolUse.input === 'string'
                  ? toolUse.input
                  : JSON.stringify(toolUse.input, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </CollapsibleCard>
    )
  }

  if (textContent) {
    return (
      <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 relative">
        {isStreaming && (
          <div className="absolute top-4 right-4">
            <Cog className="h-6 w-6 text-green-600 animate-cog-spin" />
          </div>
        )}
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Bot className="h-4 w-4 text-green-600" />
            Code Agent
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm">
            <Markdown>{textContent}</Markdown>
          </p>
        </CardContent>
      </Card>
    )
  }

  return null
})

const ToolResultCard = memo(function ToolResultCard({ data, isStreaming }: { data: any; isStreaming?: boolean }) {
  // --- Slim format: subtype === 'tool_result' ---
  if (data.subtype === 'tool_result') {
    const isError = !data.success
    return (
      <CollapsibleCard
        cardClassName={isError ? 'border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800' : 'border-gray-200 bg-gray-50 dark:bg-gray-950/20 dark:border-gray-800'}
        icon={isError ? <AlertTriangle className="h-4 w-4 text-yellow-600" /> : <CheckCircle className="h-4 w-4 text-green-600" />}
        title={isError ? 'Tool Error' : 'Tool Result'}
        streamingIndicator={isStreaming ? <Cog className={`h-6 w-6 ${isError ? 'text-yellow-600' : 'text-gray-600'} animate-cog-spin`} /> : undefined}
      />
    )
  }

  // --- Legacy format ---
  const message = data.message || data
  const content = message.content?.[0]?.content || message.content || ''
  const isError =
    (typeof content === 'string' && (content.includes('Error') || content.includes('error'))) || data.is_error

  return (
    <CollapsibleCard
      cardClassName={isError ? 'border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800' : 'border-gray-200 bg-gray-50 dark:bg-gray-950/20 dark:border-gray-800'}
      icon={isError ? <AlertTriangle className="h-4 w-4 text-yellow-600" /> : <FileText className="h-4 w-4 text-gray-600" />}
      title={isError ? 'Not Found' : 'File Content'}
      streamingIndicator={isStreaming ? <Cog className={`h-6 w-6 ${isError ? 'text-yellow-600' : 'text-gray-600'} animate-cog-spin`} /> : undefined}
    >
      <div className="bg-background/50 p-3 rounded border font-mono text-xs max-h-40 overflow-y-auto">
        <pre className="whitespace-pre-wrap break-words">
          {typeof content === 'string' ? content : JSON.stringify(content, null, 2)}
        </pre>
      </div>
    </CollapsibleCard>
  )
})

const ResultCard = memo(function ResultCard({ data, isStreaming }: { data: any; isStreaming?: boolean }) {
  const isSuccess = data.subtype === 'success' || !data.is_error
  const result = data.result || data.message || ''

  //NOTE: is the same message as the last assistant one, so its repetitive.
  if(isSuccess) {
    return null
  }
  return (
    <CollapsibleCard
      cardClassName={isSuccess ? 'border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800' : 'border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800'}
      icon={isSuccess ? <CheckCircle className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-red-600" />}
      title={`Task ${isSuccess ? 'Completed' : 'Failed'}`}
      streamingIndicator={isStreaming ? <Cog className={`h-4 w-4 ${isSuccess ? 'text-green-600' : 'text-red-600'} animate-cog-spin`} /> : undefined}
    >
      <div className="space-y-2">
        <p className="text-sm">
          <Markdown>{typeof result === 'string' ? result : JSON.stringify(result, null, 2)}</Markdown>
        </p>
        {data.duration_ms && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {(data.duration_ms / 1000).toFixed(1)}s
            </div>
            {data.usage && (
              <div className="flex items-center gap-1">
                <Terminal className="h-3 w-3" />
                {data.usage.output_tokens} tokens
              </div>
            )}
          </div>
        )}
      </div>
    </CollapsibleCard>
  )
})

const RawContentCard = memo(function RawContentCard({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  // Try to parse content as JSON first - if it's a structured message, don't show it as raw
  const trimmedContent = content.trim()
  if (trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) {
    const parsed = tryParseJSON(trimmedContent)
    // If it parses successfully and has a type field, it should be handled by a specific card
    // This shouldn't be rendered as raw content
    if (parsed && parsed.type) {
      return null
    }
  }

  // Filter out <think> tags and their content (Claude's internal reasoning)
  if (content.includes('<think>') || content.includes('</think>') || content.includes('<think') || content.includes('think>')) {
    return null
  }

  // Check if it's a debug/log message that we should hide
  if (
    content.includes('Environment check:') ||
    content.includes('Working directory:') ||
    content.includes('Raw process.argv:') ||
    content.includes('Parsed args:') ||
    content.includes('Found arguments:') ||
    content.includes('Extracted values:') ||
    content.includes('ANTHROPIC_API_KEY exists:') ||
    content.includes('Checking target directory:') ||
    content.includes('Full path:') ||
    content.includes('Directory exists and is accessible') ||
    // Filter out Claude Code script initialization errors and system messages
    content.includes('system prompt') ||
    content.includes('System prompt') ||
    content.includes('systemPrompt') ||
    content.includes('--system-prompt') ||
    content.includes('<system>') ||
    content.includes('--prompt=') ||
    content.includes('tsx test.ts') ||
    content.includes('stderr chunk') ||
    content.includes('Current working directory:') ||
    content.includes('script error') ||
    content.includes('Script error') ||
    content.includes('spawn') ||
    content.includes('ENOENT') ||
    content.includes('command not found') ||
    content.includes('npx ') ||
    content.includes('node_modules') ||
    // Filter out system/role related content that shouldn't be shown
    content.includes('"role"') ||
    content.includes('"system"') ||
    content.includes('"content":[') ||
    // Filter out raw JSON that looks like message structure
    (content.includes('"type"') && content.includes('"content"'))
  ) {
    return null
  }

  // Check if it's a completion message
  if (content.includes('Query completed successfully')) {
    return (
      <CollapsibleCard
        cardClassName="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800"
        icon={<CheckCircle className="h-4 w-4 text-green-600" />}
        title="Execution Complete"
        streamingIndicator={isStreaming ? <Cog className="h-6 w-6 text-green-600 animate-cog-spin" /> : undefined}
      >
        <p className="text-sm text-green-700 dark:text-green-300">
          Claude Code execution completed successfully
        </p>
      </CollapsibleCard>
    )
  }

  // Check if it's a summary message (starts with ✅)
  if (content.startsWith('✅')) {
    return (
      <CollapsibleCard
        cardClassName="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800"
        icon={<CheckCircle className="h-4 w-4 text-green-600" />}
        title="Summary"
        streamingIndicator={isStreaming ? <Cog className="h-6 w-6 text-green-600 animate-cog-spin" /> : undefined}
      >
        <p className="text-sm text-green-700 dark:text-green-300">
          {content.replace('✅ ', '')}
        </p>
      </CollapsibleCard>
    )
  }

  // Check if it's an error message (starts with ❌)
  // But skip initialization-related errors that shouldn't be shown
  if (content.startsWith('❌')) {
    // Filter out initialization/script errors
    if (
      content.includes('spawn') ||
      content.includes('ENOENT') ||
      content.includes('npx') ||
      content.includes('node_modules') ||
      content.includes('system') ||
      content.includes('initialization') ||
      content.includes('script')
    ) {
      return null
    }

    return (
      <CollapsibleCard
        cardClassName="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800"
        icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
        title="Error"
        streamingIndicator={isStreaming ? <Cog className="h-6 w-6 text-red-600 animate-cog-spin" /> : undefined}
      >
        <p className="text-sm text-red-700 dark:text-red-300">
          {content.replace('❌ Error: ', '')}
        </p>
      </CollapsibleCard>
    )
  }

  // Check if it's a startup message
  if (
    content.includes('Starting Claude Code query') ||
    content.includes('claude-sdk@')
  ) {
    return (
      <CollapsibleCard
        cardClassName="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800"
        icon={<Play className="h-4 w-4 text-blue-600" />}
        title="Starting Process"
        streamingIndicator={isStreaming ? <Cog className="h-6 w-6 text-blue-600 animate-cog-spin" /> : undefined}
      >
        <p className="text-sm text-blue-700 dark:text-blue-300">
          {content.includes('claude-sdk@')
            ? 'Initializing AI Code Agent...'
            : content}
        </p>
      </CollapsibleCard>
    )
  }

  // Filter out empty or very short content, and any other unhandled content
  return null
})

export const ClaudeCodeMessage = memo(function ClaudeCodeMessage({ content, isStreaming, isLastCard }: ClaudeCodeMessageProps) {
  // CRITICAL: Memoize the expensive parsing operation to prevent re-parsing on every render
  const claudeMessages = useMemo(() => {
    return extractClaudeMessages(content)
  }, [content])

  return (
    <div className="space-y-2">
      {claudeMessages
        .map((claudeMessage, index) => {
          // Only show spinner on the very last card when streaming
          const showSpinner = isStreaming && isLastCard && index === claudeMessages.length - 1
          
          // Handle JSON parsed messages
          if (
            claudeMessage.type === 'system' &&
            claudeMessage.subtype === 'init'
          ) {
            return <SystemInitCard key={index} data={claudeMessage} isStreaming={showSpinner} />
          }

          if (claudeMessage.type === 'assistant') {
            return <AssistantMessageCard key={index} data={claudeMessage} isStreaming={showSpinner} />
          }

          if (claudeMessage.type === 'user') {
            return <ToolResultCard key={index} data={claudeMessage} isStreaming={showSpinner} />
          }

          if (claudeMessage.type === 'result') {
            return <ResultCard key={index} data={claudeMessage} isStreaming={showSpinner} />
          }

          // Handle raw content from streaming
          if (claudeMessage.rawContent) {
            return (
              <RawContentCard key={index} content={claudeMessage.rawContent} isStreaming={showSpinner} />
            )
          }

          return null
        })
        .filter(Boolean)}
    </div>
  )
})
