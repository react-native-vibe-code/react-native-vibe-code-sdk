import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  InteractionManager,
  Linking,
} from 'react-native'
import { generateAPIUrl, dotFetch } from './api'
import { ClaudeCodeMessage } from './components/ClaudeCodeMessage'
import { useDotConfig } from './DotContext'
import { useChat } from '@ai-sdk/react'
import { Home, RefreshCw } from 'lucide-react-native'

interface Project {
  id: string
  title: string
  template: string
  status: string
  createdAt: string
  updatedAt: string
  ngrokUrl?: string
}

interface ChatScreenProps {
  onNavigateHome: () => void
  onClose: () => void
  selectedProject: Project | null
}

// Helper function to check if an error is retryable (network issues)
function isRetryableError(error: any): boolean {
  if (!error) return false

  const errorMessage = error.message?.toLowerCase() || ''
  const retryableErrors = [
    'network connection was lost',
    'network request failed',
    'connection lost',
    'timeout',
    'fetch failed',
    'network error',
    'connection refused',
    'socket hang up',
    'response body is empty', // Backend streaming issue - suppress from UI
  ]

  return retryableErrors.some(msg => errorMessage.includes(msg))
}

// Helper function to detect if message content is from Claude Code
function isClaudeCodeMessage(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false
  }

  return (
    content.includes('📝 Message') ||
    content.includes('Streaming:') ||
    content.includes('claude-sdk@') ||
    content.includes('Starting test script') ||
    content.includes('Claude Code query') ||
    content.includes('session_id') ||
    (content.includes('{') && content.includes('"type"')) ||
    content.includes('Query completed successfully')
  )
}

// Helper function to split Claude Code message content into individual parts
function splitClaudeCodeContent(content: string): string[] {
  if (!content || typeof content !== 'string') {
    return []
  }

  // Split by common delimiters in Claude Code streaming
  const parts = content
    .split(/(?=📝 Message \d+:)|(?=Streaming:)/)
    .filter((part) => part.trim())

  // If no specific patterns found, split by lines that look like separate messages
  if (parts.length <= 1) {
    const lines = content.split('\n').filter((line) => line.trim())
    const messageParts: string[] = []
    let currentPart = ''

    for (const line of lines) {
      if (line.includes('{') && line.includes('"type"') && currentPart) {
        messageParts.push(currentPart.trim())
        currentPart = line
      } else {
        currentPart += (currentPart ? '\n' : '') + line
      }
    }

    if (currentPart) {
      messageParts.push(currentPart.trim())
    }

    return messageParts.length > 1 ? messageParts : [content]
  }

  return parts
}

export function ChatScreen({ onNavigateHome, onClose, selectedProject }: ChatScreenProps) {
  const { projectId, apiBaseUrl } = useDotConfig()
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isStreamActive, setIsStreamActive] = useState(false)
  const [displayError, setDisplayError] = useState<Error | null>(null)
  const loadedProjectIdRef = useRef<string | null>(null)
  const streamStartMessageCountRef = useRef<number>(0) // Track message count when streaming starts
  const flatListRef = useRef<FlatList>(null)
  const isNearBottomRef = useRef(true) // Track if user is near bottom
  const shouldAutoScrollRef = useRef(true) // Track if we should auto-scroll
  const pendingScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearPendingScroll = useCallback(() => {
    if (pendingScrollTimeoutRef.current) {
      clearTimeout(pendingScrollTimeoutRef.current)
      pendingScrollTimeoutRef.current = null
    }
  }, [])

  const scrollToBottom = useCallback(
    ({ animated = false, delay = 0 }: { animated?: boolean; delay?: number } = {}) => {
      if (!flatListRef.current) {
        return
      }

      clearPendingScroll()

      const runScroll = () => {
        InteractionManager.runAfterInteractions(() => {
          flatListRef.current?.scrollToEnd({ animated })
        })
      }

      if (delay > 0) {
        pendingScrollTimeoutRef.current = setTimeout(runScroll, delay)
      } else {
        runScroll()
      }
    },
    [clearPendingScroll],
  )

  // Use the AI SDK's useChat hook for streaming (same as web version)
  const {
    messages,
    error,
    input,
    handleInputChange,
    handleSubmit,
    setMessages,
  } = useChat({
    experimental_throttle: 10,
    api: generateAPIUrl(apiBaseUrl, '/api/chat'),
    body: {
      projectId: selectedProject?.id || projectId,
    },
    fetch: dotFetch,
    sendExtraMessageFields: true,
    keepLastMessageOnError: true,
    experimental_prepareRequestBody: ({ messages, requestData, requestBody }: any) => {
      // Only send the last user message to avoid payload too large errors
      const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop()

      console.log('[ChatScreen] experimental_prepareRequestBody called:', {
        totalMessages: messages.length,
        hasLastUserMessage: !!lastUserMessage,
        requestBodyKeys: Object.keys(requestBody || {}),
        requestDataKeys: Object.keys(requestData || {}),
      })

      const newBody = {
        projectId: requestData?.body?.projectId || selectedProject?.id || projectId,
        messages: lastUserMessage ? [lastUserMessage] : [],
      }

      console.log('[ChatScreen] Final request body:', newBody)

      return newBody
    },
    onError: error => {
      // Clear send timeout
      if (sendTimeoutRef.current) {
        clearTimeout(sendTimeoutRef.current)
        sendTimeoutRef.current = null
      }

      // Only show and log non-retryable errors to users
      if (!isRetryableError(error)) {
        console.error('[ChatScreen] Non-retryable error:', error?.message)
        setDisplayError(error)
      } else {
        console.log('[ChatScreen] Retryable error suppressed:', error?.message)
        setDisplayError(null)
      }

      setIsStreamActive(false)
    },
    onResponse: (response: Response) => {
      console.log('[ChatScreen] Response received:', {
        status: response.status,
        contentType: response.headers.get('content-type'),
      })
      if (sendTimeoutRef.current) {
        clearTimeout(sendTimeoutRef.current)
        sendTimeoutRef.current = null
      }
      setDisplayError(null)
      setIsStreamActive(true)
    },
    onFinish: (message: any) => {
      console.log('[ChatScreen] Stream finished, message:', {
        id: message.id,
        role: message.role,
        contentLength: message.content?.length || 0,
      })
      if (sendTimeoutRef.current) {
        clearTimeout(sendTimeoutRef.current)
        sendTimeoutRef.current = null
      }
      setIsStreamActive(false)
    },
  })

  // Load chat history when project changes
  useEffect(() => {
    const loadChatHistory = async () => {
      if (!selectedProject) {
        return
      }

      // Only load if we haven't loaded this project yet
      if (loadedProjectIdRef.current === selectedProject.id) {
        return
      }

      console.log('[ChatScreen] Loading chat history for project:', selectedProject.id)
      setIsLoadingHistory(true)

      try {
        const url = generateAPIUrl(apiBaseUrl, '/api/chat/history')
        console.log('[ChatScreen] Fetching from URL:', url)

        // Create abort controller for timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => {
          console.log('[ChatScreen] Request timeout after 15 seconds')
          controller.abort()
        }, 15000)

        const response = await dotFetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            projectId: selectedProject.id,
            limit: 30,
          }),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        console.log('[ChatScreen] Response status:', response.status)

        if (!response.ok) {
          const errorText = await response.text()
          console.log('[ChatScreen] History fetch failed:', response.status, errorText)
          throw new Error(`Failed to load history: ${response.status}`)
        }

        const data = await response.json()

        if (data.messages && data.messages.length > 0) {
          console.log('[ChatScreen] Loaded', data.messages.length, 'messages')
          setMessages(data.messages)
          loadedProjectIdRef.current = selectedProject.id
        } else {
          console.log('[ChatScreen] No history found')
          loadedProjectIdRef.current = selectedProject.id
        }
      } catch (error) {
        console.log('[ChatScreen] Error loading chat history:', error instanceof Error ? error.message : String(error))
        loadedProjectIdRef.current = selectedProject.id
      } finally {
        setIsLoadingHistory(false)
      }
    }

    loadChatHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject?.id])

  // Scroll to bottom when messages update - during streaming or if user is near bottom
  useEffect(() => {
    console.log('[ChatScreen] Messages updated:', messages.length, 'messages')
    if (messages.length > 0 && (isStreamActive || shouldAutoScrollRef.current)) {
      scrollToBottom({ animated: false, delay: 100 })
    }
  }, [messages, isStreamActive, scrollToBottom])

  // Backup: detect stream completion from message content when onFinish doesn't fire
  useEffect(() => {
    if (!isStreamActive) return
    if (messages.length <= streamStartMessageCountRef.current) return

    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.role === 'assistant' && lastMessage?.content) {
      const content = lastMessage.content
      if (content.includes('✅') || content.includes('Query completed successfully')) {
        console.log('[ChatScreen] Detected completion in message content, resetting stream state')
        setIsStreamActive(false)
      }
    }
  }, [messages, isStreamActive])

  // Scroll to bottom after chat history loads (always)
  useEffect(() => {
    if (!isLoadingHistory && messages.length > 0) {
      shouldAutoScrollRef.current = true
      isNearBottomRef.current = true
      scrollToBottom({ animated: false, delay: 400 })
    }
  }, [isLoadingHistory, messages.length, scrollToBottom])

  useEffect(() => {
    return () => {
      clearPendingScroll()
      if (sendTimeoutRef.current) {
        clearTimeout(sendTimeoutRef.current)
      }
    }
  }, [clearPendingScroll])

  // Handle scroll events to detect if user scrolled up
  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent

    const paddingToBottom = 100
    const isNearBottom = layoutMeasurement.height + contentOffset.y >=
      contentSize.height - paddingToBottom

    isNearBottomRef.current = isNearBottom
    shouldAutoScrollRef.current = isNearBottom

    if (!isNearBottom) {
      console.log('[ChatScreen] User scrolled up, disabling auto-scroll')
    }
  }

  const handleSend = () => {
    if (!input.trim() || !selectedProject || isStreamActive) {
      return
    }

    console.log('[ChatScreen] Sending message:', {
      text: input.trim(),
      projectId: selectedProject.id,
    })

    shouldAutoScrollRef.current = true
    isNearBottomRef.current = true

    if (sendTimeoutRef.current) {
      clearTimeout(sendTimeoutRef.current)
    }

    streamStartMessageCountRef.current = messages.length
    setIsStreamActive(true)

    const syntheticEvent = {
      preventDefault: () => {},
    } as React.FormEvent

    handleSubmit(syntheticEvent)

    sendTimeoutRef.current = setTimeout(() => {
      console.log('[ChatScreen] Send timeout reached, resetting stream state')
      setIsStreamActive(false)
    }, 60000)
  }

  const handleReload = useCallback(async () => {
    console.log('[ChatScreen] ========== RELOAD BUTTON PRESSED ==========')

    if (!selectedProject?.ngrokUrl) {
      console.log('[ChatScreen] No ngrok URL available, cannot reload via deep link')
      return
    }

    const baseDeeplinkUrl = selectedProject.ngrokUrl.replace('https://', 'exp://')
    const deeplinkUrl = `${baseDeeplinkUrl}?projectId=${encodeURIComponent(selectedProject.id)}`

    console.log('[ChatScreen] Opening deeplink for reload:', deeplinkUrl)

    onClose()
    await Linking.openURL(deeplinkUrl)
  }, [selectedProject, onClose])

  const renderMessage = ({ item, index }: { item: any; index: number }) => {
    const isUser = item.role === 'user'
    const content = item.content || ''
    const isClaudeCode = isClaudeCodeMessage(content)

    if (isClaudeCode && !isUser) {
      const messageParts = splitClaudeCodeContent(content)
      const isLastMessage = index === messages.length - 1

      return (
        <View style={styles.messageContainer}>
          {messageParts.map((part, partIndex) => {
            const isLastPart = partIndex === messageParts.length - 1
            const isLastCard = isLastMessage && isLastPart

            return (
              <ClaudeCodeMessage
                key={`${item.id}-part-${partIndex}`}
                content={part}
                isStreaming={isStreamActive}
                isLastCard={isLastCard}
              />
            )
          })}
        </View>
      )
    }

    return (
      <View
        style={[
          styles.messageBubble,
          isUser ? styles.userMessage : styles.assistantMessage,
        ]}
      >
        <Text
          style={[
            styles.messageText,
            isUser ? styles.userMessageText : styles.assistantMessageText,
          ]}
        >
          {content}
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header with home button, project title, and close button */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onNavigateHome}
          style={styles.headerButton}
          activeOpacity={0.7}
        >
          <Home size={22} color="black" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {selectedProject?.title || 'Chat'}
          </Text>
          {selectedProject && (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {selectedProject.template}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={handleReload}
          style={styles.headerButton}
          activeOpacity={0.7}
        >
          <RefreshCw size={22} color="black" />
        </TouchableOpacity>
      </View>

      {/* Error display - only shows non-retryable errors */}
      {displayError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{displayError.message}</Text>
        </View>
      )}

      {/* Loading history indicator */}
      {isLoadingHistory ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="black" />
          <Text style={styles.loadingText}>Loading chat history...</Text>
        </View>
      ) : (
        <>
          {/* Chat messages */}
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={400}
            onContentSizeChange={() => {
              if (isStreamActive || shouldAutoScrollRef.current) {
                scrollToBottom({ animated: false })
              }
            }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  Start a conversation about your project
                </Text>
                <Text style={styles.emptyStateSubtext}>
                  Ask questions or request code changes
                </Text>
              </View>
            }
          />

          {/* Input area */}
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
          >
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={(text) => {
                  const event = {
                    target: { value: text },
                  } as React.ChangeEvent<HTMLInputElement>
                  handleInputChange(event)
                }}
                placeholder="Type a message to agent..."
                placeholderTextColor="#999"
                multiline
                maxLength={2000}
                editable={!isStreamActive}
              />
              <TouchableOpacity
                onPress={handleSend}
                style={[
                  styles.sendButton,
                  (!input.trim() || isStreamActive) && styles.sendButtonDisabled,
                ]}
                disabled={!input.trim() || isStreamActive}
                activeOpacity={0.7}
              >
                {isStreamActive ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.sendButtonText}>Send</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  headerTitleContainer: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  messageList: {
    padding: 16,
    flexGrow: 1,
  },
  messageContainer: {
    marginBottom: 12,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0f0f0',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  userMessageText: {
    color: '#fff',
  },
  assistantMessageText: {
    color: '#000',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#f8f8f8',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 12,
    fontSize: 15,
    color: '#000',
  },
  sendButton: {
    backgroundColor: 'black',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 70,
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: '#fee',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  errorText: {
    color: '#c00',
    fontSize: 14,
  },
})
