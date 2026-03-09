import React from 'react'
import { View, Text, StyleSheet, Platform, Animated } from 'react-native'
import { Settings, FileText, Edit3, Zap, Bot, CheckCircle, AlertCircle, Clock, Cog, Play } from 'lucide-react-native'

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

// Helper function to extract Claude messages from formatted content
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
    }

    // Otherwise return as raw content
    return [{ rawContent: streamContent }]
  }

  // Return as raw content
  return [{ rawContent: content }]
}

// Spinning Cog Animation Component
const SpinningCog = ({ size = 24, color = '#666' }: { size?: number; color?: string }) => {
  const spinValue = React.useRef(new Animated.Value(0)).current

  React.useEffect(() => {
    const spinAnimation = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      })
    )
    spinAnimation.start()

    return () => spinAnimation.stop()
  }, [spinValue])

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  return (
    <Animated.View style={{ transform: [{ rotate: spin }] }}>
      <Cog size={size} color={color} />
    </Animated.View>
  )
}

// Card component wrappers
const Card = ({ children, style }: { children: React.ReactNode; style?: any }) => (
  <View style={[styles.card, style]}>{children}</View>
)

const CardHeader = ({ children }: { children: React.ReactNode }) => (
  <View style={styles.cardHeader}>{children}</View>
)

const CardTitle = ({ children, Icon }: { children: React.ReactNode; Icon?: React.ComponentType<any> }) => (
  <View style={styles.cardTitle}>
    {Icon && <Icon size={16} color="#333" style={styles.cardIcon} />}
    <Text style={styles.cardTitleText}>{children}</Text>
  </View>
)

const CardContent = ({ children }: { children: React.ReactNode }) => (
  <View style={styles.cardContent}>{children}</View>
)

const Badge = ({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'secondary' | 'success' | 'warning' }) => (
  <View style={[styles.badge, variant === 'secondary' && styles.badgeSecondary, variant === 'success' && styles.badgeSuccess, variant === 'warning' && styles.badgeWarning]}>
    <Text style={styles.badgeText}>{children}</Text>
  </View>
)

// Individual message cards
const SystemInitCard = ({ data }: { data: any }) => (
  <Card style={styles.systemCard}>
    <CardHeader>
      <CardTitle Icon={Settings}>Session Started</CardTitle>
    </CardHeader>
    <CardContent>
      <View style={styles.badgeContainer}>
        <Badge variant="secondary">{data.model}</Badge>
        <Badge variant="secondary">{data.cwd}</Badge>
      </View>
      <Text style={styles.metadataText}>
        {data.tools?.length} tools available • Session: {data.session_id?.slice(0, 8)}...
      </Text>
    </CardContent>
  </Card>
)

const TodoListCard = ({ data, isStreaming }: { data: any; isStreaming?: boolean }) => {
  let todos = []

  if (data.input?.todos) {
    todos = data.input.todos
  } else if (Array.isArray(data.input)) {
    todos = data.input
  }

  const completed = todos.filter((t: any) => t.status === 'completed').length
  const hasInProgress = todos.some((t: any) => t.status === 'in_progress')

  return (
    <Card style={styles.todoCard}>
      {isStreaming && hasInProgress && (
        <View style={styles.cogContainer}>
          <SpinningCog size={24} color="#6366F1" />
        </View>
      )}
      <CardHeader>
        <View style={styles.todoHeader}>
          <CardTitle Icon={FileText}>Todo List</CardTitle>
          <Badge variant="secondary">{completed}/{todos.length}</Badge>
        </View>
      </CardHeader>
      <CardContent>
        {todos.map((todo: any, index: number) => {
          const isCompleted = todo.status === 'completed'
          const isInProgress = todo.status === 'in_progress'

          return (
            <View
              key={index}
              style={[
                styles.todoItem,
                isCompleted && styles.todoCompleted,
                isInProgress && styles.todoInProgress,
              ]}
            >
              <View style={styles.todoIconContainer}>
                {isCompleted ? (
                  <CheckCircle size={16} color="#059669" />
                ) : isInProgress ? (
                  <SpinningCog size={16} color="#3B82F6" />
                ) : (
                  <View style={styles.todoCircle} />
                )}
              </View>
              <View style={styles.todoContent}>
                <Text
                  style={[
                    styles.todoText,
                    isCompleted && styles.todoTextCompleted,
                  ]}
                >
                  {typeof todo.content === 'string' ? todo.content : JSON.stringify(todo.content)}
                </Text>
                {todo.activeForm && isInProgress && (
                  <Text style={styles.todoActiveForm}>{todo.activeForm}</Text>
                )}
              </View>
            </View>
          )
        })}
      </CardContent>
    </Card>
  )
}

const AssistantMessageCard = ({ data, isStreaming }: { data: any; isStreaming?: boolean }) => {
  const message = data.message || data
  const textContent = message.content?.find((c: any) => c.type === 'text')?.text || ''
  const toolUse = message.content?.find((c: any) => c.type === 'tool_use')

  if (toolUse) {
    // Special handling for TodoWrite tool
    if (toolUse.name === 'TodoWrite') {
      return <TodoListCard data={toolUse} isStreaming={isStreaming} />
    }

    // Special handling for Write/Edit tools
    if (toolUse.name === 'Write' || toolUse.name === 'Edit') {
      const filePath = toolUse.input?.file_path || 'unknown file'
      return (
        <Card style={styles.editCard}>
          {isStreaming && (
            <View style={styles.cogContainer}>
              <SpinningCog size={24} color="#D97706" />
            </View>
          )}
          <CardHeader>
            <CardTitle Icon={toolUse.name === 'Write' ? FileText : Edit3}>
              {toolUse.name === 'Write' ? 'Writing to file' : 'Editing file'}
            </CardTitle>
          </CardHeader>
          {/* <CardContent>
            <View style={styles.codeBlock}>
              <Text style={styles.codeText}>{filePath}</Text>
            </View>
          </CardContent> */}
        </Card>
      )
    }

    // Default tool use UI
    return (
      <Card style={styles.toolCard}>
        {isStreaming && (
          <View style={styles.cogContainer}>
            <SpinningCog size={24} color="#A855F7" />
          </View>
        )}
        <CardHeader>
          <CardTitle Icon={Zap}>Using Tool: {toolUse.name}</CardTitle>
        </CardHeader>
        {/* <CardContent>
          <View style={styles.codeBlock}>
            <Text style={styles.codeText}>
              {typeof toolUse.input === 'string'
                ? toolUse.input
                : JSON.stringify(toolUse.input, null, 2)}
            </Text>
          </View>
        </CardContent> */}
      </Card>
    )
  }

  if (textContent) {
    return (
      <Card style={styles.assistantCard}>
        {isStreaming && (
          <View style={styles.cogContainer}>
            <SpinningCog size={24} color="#10B981" />
          </View>
        )}
        <CardHeader>
          <CardTitle Icon={Bot}>Code Agent</CardTitle>
        </CardHeader>
        <CardContent>
          <Text style={styles.messageText}>{textContent}</Text>
        </CardContent>
      </Card>
    )
  }

  return null
}

const RawContentCard = ({ content, isStreaming }: { content: string; isStreaming?: boolean }) => {
  // Try to parse content as JSON first - if it's a structured message, don't show it as raw
  const trimmedContent = content.trim()
  if (trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) {
    const parsed = tryParseJSON(trimmedContent)
    // If it parses successfully and has a type field, it should be handled by a specific card
    if (parsed && parsed.type) {
      return null
    }
  }

  // Comprehensive filter for debug/log messages that shouldn't be shown
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
    (content.includes('"type"') && content.includes('"content"')) ||
    !content.trim() ||
    content.trim().length < 3
  ) {
    return null
  }

  // Handle "Starting Process" card - only show during active streaming, not for historical messages
  if (isStreaming && (content.includes('claude-sdk@') || content.includes('Starting test script'))) {
    return (
      <Card style={styles.processCard}>
        {isStreaming && (
          <View style={styles.cogContainer}>
            <SpinningCog size={24} color="#2563EB" />
          </View>
        )}
        <CardHeader>
          <CardTitle Icon={Play}>Starting Process</CardTitle>
        </CardHeader>
        <CardContent>
          <Text style={styles.processText}>
            {content.includes('claude-sdk@')
              ? 'Initializing AI Code Agent...'
              : content}
          </Text>
        </CardContent>
      </Card>
    )
  }

  // Check if it's a completion message
  if (content.includes('Query completed successfully')) {
    return (
      <Card style={styles.successCard}>
        <CardHeader>
          <CardTitle Icon={CheckCircle}>Execution Complete</CardTitle>
        </CardHeader>
        <CardContent>
          <Text style={styles.successText}>Claude Code execution completed successfully</Text>
        </CardContent>
      </Card>
    )
  }

  // Check if it's a summary message (starts with ✅)
  if (content.startsWith('✅')) {
    return (
      <Card style={styles.successCard}>
        <CardHeader>
          <CardTitle Icon={CheckCircle}>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <Text style={styles.successText}>{content.replace('✅ ', '')}</Text>
        </CardContent>
      </Card>
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
      <Card style={styles.errorCard}>
        <CardHeader>
          <CardTitle Icon={AlertCircle}>Error</CardTitle>
        </CardHeader>
        <CardContent>
          <Text style={styles.errorText}>{content.replace('❌ Error: ', '')}</Text>
        </CardContent>
      </Card>
    )
  }

  return null
}

export function ClaudeCodeMessage({ content, isStreaming, isLastCard }: ClaudeCodeMessageProps) {
  const claudeMessages = extractClaudeMessages(content)
  let hasShownCompletionCard = false

  return (
    <View style={styles.container}>
      {claudeMessages.map((claudeMessage, index) => {
        // Only show cog on the last card when streaming
        const showCog = isStreaming && isLastCard

        // Handle JSON parsed messages
        if (claudeMessage.type === 'system' && claudeMessage.subtype === 'init') {
          return <SystemInitCard key={index} data={claudeMessage} />
        }

        if (claudeMessage.type === 'assistant') {
          return <AssistantMessageCard key={index} data={claudeMessage} isStreaming={showCog} />
        }

        // Handle 'user' type (tool results) - return null, don't show these cards
        if (claudeMessage.type === 'user') {
          return null
        }

        // Handle 'result' type - return null, same as web version for success
        if (claudeMessage.type === 'result') {
          return null
        }

        // Handle raw content from streaming
        if (claudeMessage.rawContent) {
          // Skip duplicate completion cards
          const isCompletionContent = claudeMessage.rawContent.includes('Query completed successfully') ||
                                       claudeMessage.rawContent.startsWith('✅')
          if (isCompletionContent && hasShownCompletionCard) {
            return null
          }
          if (isCompletionContent) {
            hasShownCompletionCard = true
          }
          return <RawContentCard key={index} content={claudeMessage.rawContent} isStreaming={showCog} />
        }

        return null
      }).filter(Boolean)}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  cardTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardIcon: {
    marginRight: 4,
  },
  cardTitleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  cardContent: {
    padding: 12,
  },
  systemCard: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  todoCard: {
    backgroundColor: '#F5F3FF',
    borderColor: '#DDD6FE',
  },
  editCard: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  toolCard: {
    backgroundColor: '#F3E8FF',
    borderColor: '#E9D5FF',
  },
  assistantCard: {
    backgroundColor: '#DCFCE7',
    borderColor: '#BBF7D0',
  },
  successCard: {
    backgroundColor: '#DCFCE7',
    borderColor: '#BBF7D0',
  },
  errorCard: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  processCard: {
    backgroundColor: '#DBEAFE',
    borderColor: '#BFDBFE',
  },
  cogContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
  },
  processText: {
    fontSize: 13,
    color: '#1E40AF',
  },
  badgeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
  },
  badgeSecondary: {
    backgroundColor: '#E5E7EB',
  },
  badgeSuccess: {
    backgroundColor: '#DCFCE7',
  },
  badgeWarning: {
    backgroundColor: '#FEF3C7',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#374151',
  },
  metadataText: {
    fontSize: 11,
    color: '#6B7280',
  },
  todoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  todoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 8,
    backgroundColor: '#F9FAFB',
  },
  todoCompleted: {
    backgroundColor: '#DCFCE7',
    borderColor: '#BBF7D0',
  },
  todoInProgress: {
    backgroundColor: '#DBEAFE',
    borderColor: '#BFDBFE',
  },
  todoIconContainer: {
    marginTop: 2,
  },
  todoCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#9CA3AF',
  },
  todoContent: {
    flex: 1,
  },
  todoText: {
    fontSize: 13,
    color: '#111827',
  },
  todoTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#6B7280',
  },
  todoActiveForm: {
    fontSize: 11,
    color: '#3B82F6',
    marginTop: 4,
  },
  codeBlock: {
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  codeText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#111827',
  },
  messageText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#111827',
  },
  successText: {
    fontSize: 13,
    color: '#065F46',
  },
  errorText: {
    fontSize: 13,
    color: '#991B1B',
  },
})
