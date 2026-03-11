'use client'

import { Badge } from '@react-native-vibe-code/ui/components/badge'
import { Button } from '@react-native-vibe-code/ui/components/button'
import { ScrollArea } from '@react-native-vibe-code/ui/components/scroll-area'
import { cn } from '@react-native-vibe-code/ui/lib/utils'
import Editor from '@monaco-editor/react'
import {
  Copy,
  FileCode,
  Folder,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Loader2,
} from 'lucide-react'
import { useState, useEffect, useRef, memo, useCallback, useMemo } from 'react'
import { useFileChangeEvents } from '../hooks/useFileChangeEvents'
import { searchService } from '../lib/search-service'
import { useTheme } from 'next-themes'
import { githubLightTheme, githubDarkTheme } from '../themes'

export interface FileItem {
  name: string
  type: string
  path: string
  children?: FileItem[]
  size?: string
}

export interface SubscriptionStatus {
  hasSubscription: boolean
  status: 'active' | 'inactive' | 'cancelled' | string
}

export interface CodePanelProps {
  code: string
  currentFile: string
  onCodeChange?: (code: string) => void
  onFileSelect?: (fileName: string) => void
  projectId?: string
  appData?: {
    code?: string
    file_path?: string
    [key: string]: unknown
  }
  isDesktopMode?: boolean
  onToggleMobileView?: () => void
  hideHeader?: boolean
  subscriptionStatus?: SubscriptionStatus | null
  isLoadingSubscription?: boolean
  onShowSubscriptionModal?: () => void
}

// Helper function to detect language from file extension
function getLanguageFromPath(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase()

  const languageMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    rb: 'ruby',
    php: 'php',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    json: 'json',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    sh: 'bash',
    bash: 'bash',
    zsh: 'zsh',
    sql: 'sql',
    dockerfile: 'dockerfile',
    toml: 'toml',
    ini: 'ini',
    conf: 'nginx',
  }

  return languageMap[extension || ''] || ''
}

// Helper function to build hierarchical structure from flat file list
function buildHierarchicalStructure(flatFiles: FileItem[]): FileItem[] {
  const root: Record<string, unknown> = {}

  // Filter out excluded folders and files
  const filteredFiles = flatFiles.filter((file) => {
    const path = file.path
    return (
      !path.includes('features/element-edition') &&
      !path.includes('features/floating-chat') &&
      path !== 'contexts/AuthContext.tsx'
    )
  })

  // First pass: create all folders and files
  filteredFiles.forEach((file) => {
    const parts = file.path.split('/').filter((p) => p !== '')
    let currentLevel = root as Record<string, unknown>
    let currentPath = ''

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part

      if (index === parts.length - 1) {
        // It's the file itself
        currentLevel[part] = {
          name: part,
          type: file.type,
          path: file.path,
        }
      } else {
        // It's a folder
        if (!currentLevel[part]) {
          currentLevel[part] = {
            name: part,
            type: 'folder',
            path: currentPath,
            children: {},
          }
        }
        // Move to the next level
        currentLevel = (currentLevel[part] as { children: Record<string, unknown> }).children
      }
    })
  })

  // Second pass: convert to array structure
  const convertToArray = (obj: Record<string, unknown>): FileItem[] => {
    return Object.entries(obj)
      .map(([, item]) => {
        const typedItem = item as FileItem & { children?: Record<string, unknown> }
        if (typedItem.children && typeof typedItem.children === 'object') {
          return {
            ...typedItem,
            children: convertToArray(typedItem.children as Record<string, unknown>),
          }
        }
        return typedItem as FileItem
      })
      .sort((a: FileItem, b: FileItem) => {
        // Sort folders first, then files
        if (a.type === 'folder' && b.type !== 'folder') return -1
        if (a.type !== 'folder' && b.type === 'folder') return 1
        return a.name.localeCompare(b.name)
      })
  }

  return convertToArray(root)
}

export const CodePanel = memo(function CodePanel({
  code,
  currentFile,
  onCodeChange,
  onFileSelect,
  projectId,
  appData,
  hideHeader = false,
}: CodePanelProps) {
  const { theme } = useTheme()
  const [isExpanded, setIsExpanded] = useState(true)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [fileStructure, setFileStructure] = useState<FileItem[]>([])
  const [isLoadingStructure, setIsLoadingStructure] = useState(false)
  const [isLoadingFile, setIsLoadingFile] = useState(false)
  const [fileContent, setFileContent] = useState('')
  const [selectedFilePath, setSelectedFilePath] = useState('')
  const [structureError, setStructureError] = useState<string | null>(null)
  const [editorKey, setEditorKey] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [disableErrorSquiggles, setDisableErrorSquiggles] = useState(true)
  const codeRef = useRef<HTMLElement>(null)
  const [isPolling, setIsPolling] = useState(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isSavingRef = useRef(false)
  const editorInstanceRef = useRef<unknown>(null)

  const canEdit = true

  const fetchFileStructure = useCallback(
    async (isRetry = false) => {
      if (!projectId) {
        return false
      }

      if (!isRetry) {
        setIsLoadingStructure(true)
      }

      try {
        const response = await fetch('/api/sandbox-structure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: projectId,
            action: 'structure',
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to fetch structure')
        }

        const data = await response.json()

        if (data.structure && data.structure.length > 0) {
          // Convert flat structure to hierarchical
          const hierarchicalStructure = buildHierarchicalStructure(data.structure)
          setFileStructure(hierarchicalStructure)

          // Auto-expand common folders
          const commonPaths = ['app', 'src', 'components', 'lib']
          const newExpanded = new Set<string>()
          commonPaths.forEach((path) => {
            if (
              hierarchicalStructure?.some(
                (item: FileItem) => item.name === path && item.type === 'folder'
              )
            ) {
              newExpanded.add(path)
            }
          })
          setExpandedFolders(newExpanded)

          // Stop polling if we successfully got files
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
            pollingIntervalRef.current = null
            setIsPolling(false)
          }

          setStructureError(null)
          return true
        } else {
          return false
        }
      } catch (error) {
        console.error('[CodePanel] Error fetching file structure:', error)
        if (!isRetry) {
          setStructureError(
            `Failed to fetch file structure: ${error instanceof Error ? error.message : String(error)}`
          )
        }
        return false
      } finally {
        if (!isRetry) {
          setIsLoadingStructure(false)
        }
      }
    },
    [projectId]
  )

  // Start polling for file structure with exponential backoff
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
    }

    setIsPolling(true)

    let attemptCount = 0

    // Initial attempt
    fetchFileStructure()

    // Smart polling with exponential backoff
    const scheduleNextPoll = () => {
      attemptCount++

      // Calculate interval: 5s, 10s, 20s, then stay at 30s
      const intervals = [5000, 10000, 20000, 30000]
      const interval = intervals[Math.min(attemptCount - 1, intervals.length - 1)]

      pollingIntervalRef.current = setTimeout(async () => {
        const success = await fetchFileStructure(true)
        if (!success && attemptCount < 10) {
          scheduleNextPoll()
        } else if (success) {
          setIsPolling(false)
        }
      }, interval) as unknown as NodeJS.Timeout
    }

    scheduleNextPoll()
  }, [fetchFileStructure])

  const fetchFileContent = useCallback(
    async (filePath: string, onLoadCallback?: () => void) => {
      if (!projectId) return

      setIsLoadingFile(true)
      try {
        const response = await fetch('/api/sandbox-structure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: projectId,
            action: 'file',
            filePath,
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to fetch file content')
        }

        const data = await response.json()
        setFileContent(data.content || '')
        setSelectedFilePath(filePath)
        onFileSelect?.(filePath)

        // Execute callback after content is set
        if (onLoadCallback) {
          setTimeout(onLoadCallback, 100)
        }
      } catch (error) {
        console.error('Error fetching file content:', error)
        setFileContent(
          `// Error loading file: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      } finally {
        setIsLoadingFile(false)
      }
    },
    [projectId, onFileSelect]
  )

  // Fetch file structure when projectId changes
  useEffect(() => {
    if (projectId) {
      // Reset state when project changes
      setStructureError(null)
      setFileStructure([])
      setFileContent('')
      setSelectedFilePath('')

      // Start polling for file structure
      startPolling()

      // Store project ID globally for command palette
      ;(window as { __currentProjectId?: string }).__currentProjectId = projectId

      // Expose search service globally for debugging
      ;(window as { __searchService?: typeof searchService }).__searchService = searchService

      // Preload files for search functionality (runs in background)
      searchService.preloadProjectFiles(projectId)
    } else {
      // Clear polling if no projectId
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
        setIsPolling(false)
      }
    }

    // Cleanup on unmount or projectId change
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
        setIsPolling(false)
      }
    }
  }, [projectId, startPolling])

  // Listen for file selection events from command palette
  useEffect(() => {
    const handleSelectFile = (event: CustomEvent) => {
      const { filePath, lineNumber, columnStart, columnEnd } = event.detail || {}
      if (filePath) {
        // Expand parent folders if needed
        const pathParts = filePath.split('/').filter((p: string) => p)
        const newExpanded = new Set(expandedFolders)
        let currentPath = ''

        // Add all parent folders to expanded set
        for (let i = 0; i < pathParts.length - 1; i++) {
          currentPath = currentPath ? `${currentPath}/${pathParts[i]}` : pathParts[i]
          newExpanded.add(currentPath)
        }

        setExpandedFolders(newExpanded)

        // Fetch file content with positioning callback
        fetchFileContent(filePath, () => {
          if (lineNumber && columnStart) {
            const win = window as unknown as { __positionEditorCallback?: (l: number, c: number, e?: number) => void }
            if (win.__positionEditorCallback) {
              win.__positionEditorCallback(lineNumber, columnStart, columnEnd)
            }
          }
        })
      }
    }

    // Register callback for command palette with positioning support
    ;(
      window as {
        __selectFileCallback?: (f: string, l?: number, c?: number, e?: number) => void
      }
    ).__selectFileCallback = (
      filePath: string,
      lineNumber?: number,
      columnStart?: number,
      columnEnd?: number
    ) => {
      // Expand parent folders
      const pathParts = filePath.split('/').filter((p: string) => p)
      const newExpanded = new Set(expandedFolders)
      let currentPath = ''

      for (let i = 0; i < pathParts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${pathParts[i]}` : pathParts[i]
        newExpanded.add(currentPath)
      }

      setExpandedFolders(newExpanded)

      // Fetch file content, then position cursor if needed
      fetchFileContent(filePath, () => {
        if (lineNumber && columnStart) {
          const win = window as unknown as { __positionEditorCallback?: (l: number, c: number, e?: number) => void }
          if (win.__positionEditorCallback) {
            win.__positionEditorCallback(lineNumber, columnStart, columnEnd)
          }
        }
      })
    }

    window.addEventListener('selectFile', handleSelectFile as EventListener)

    return () => {
      window.removeEventListener('selectFile', handleSelectFile as EventListener)
      delete (
        window as {
          __selectFileCallback?: (f: string, l?: number, c?: number, e?: number) => void
        }
      ).__selectFileCallback
    }
  }, [fetchFileContent, expandedFolders])

  // File change events hook
  useFileChangeEvents({
    projectId,
    onFileChange: useCallback(
      (event: { files: Array<{ path: string }> }) => {
        // Normalize paths for comparison
        const normalizePath = (path: string) => {
          return path.startsWith('./') ? path.slice(2) : path
        }

        // Check if any of the changed files match the currently selected file
        const currentFileChanged =
          selectedFilePath &&
          event.files.some((file: { path: string }) => {
            const normalizedFilePath = normalizePath(file.path)
            const normalizedSelectedPath = normalizePath(selectedFilePath)
            return normalizedFilePath === normalizedSelectedPath
          })

        // Skip reload if we're currently saving (it's our own change)
        if (isSavingRef.current && currentFileChanged) {
          return
        }

        // Update IndexedDB with changed files
        if (projectId && event.files.length > 0) {
          const changedFiles = event.files.map((file: { path: string }) => ({
            path: file.path.startsWith('./') ? file.path.slice(2) : file.path,
          }))

          setTimeout(() => {
            searchService.updateChangedFiles(projectId, changedFiles).catch((error) => {
              console.error('[CodePanel] Failed to update IndexedDB:', error)
            })
          }, 1000)
        }

        // Add a small delay to avoid conflicts with manual operations
        setTimeout(() => {
          // Skip structure refresh if we're saving (unless it's a new file)
          const isNewFile = !fileStructure.some((item: FileItem) => {
            const checkFile = (items: FileItem[]): boolean => {
              for (const item of items) {
                if (item.path === selectedFilePath) return true
                if (item.children) {
                  if (checkFile(item.children)) return true
                }
              }
              return false
            }
            return checkFile([item])
          })

          if (!isSavingRef.current || isNewFile) {
            fetchFileStructure()
          }

          // If the currently selected file was modified, reload its content immediately
          if (currentFileChanged && !isSavingRef.current) {
            setEditorKey((prev) => prev + 1)
            fetchFileContent(selectedFilePath)
          }
        }, 500)
      },
      [fetchFileStructure, selectedFilePath, fetchFileContent, projectId, fileStructure]
    ),
    enabled: !!projectId && !!selectedFilePath,
  })

  const handleRefreshClick = useCallback(() => {
    fetchFileStructure()
  }, [fetchFileStructure])

  const copyToClipboard = useCallback(() => {
    const contentToCopy = fileContent || code || appData?.code || ''
    navigator.clipboard.writeText(contentToCopy)
  }, [fileContent, code, appData?.code])

  const saveFile = useCallback(async () => {
    if (!projectId || !selectedFilePath || !fileContent) {
      console.error('Missing required data for save:', {
        projectId,
        selectedFilePath,
        hasContent: !!fileContent,
      })
      return
    }

    // Store current cursor position and selection before save
    let cursorPosition: unknown = null
    let selection: unknown = null
    if (editorInstanceRef.current) {
      const editor = editorInstanceRef.current as {
        getPosition: () => unknown
        getSelection: () => unknown
        setPosition: (pos: unknown) => void
        setSelection: (sel: unknown) => void
        focus: () => void
      }
      cursorPosition = editor.getPosition()
      selection = editor.getSelection()
    }

    setIsSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    isSavingRef.current = true

    try {
      const response = await fetch('/api/sandbox-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          filePath: selectedFilePath,
          content: fileContent,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save file')
      }

      await response.json()
      setSaveSuccess(true)

      // Update IndexedDB cache with saved content for search consistency
      if (projectId && selectedFilePath && fileContent) {
        searchService.updateChangedFiles(projectId, [{ path: selectedFilePath }]).catch((error) => {
          console.error('[CodePanel] Failed to update IndexedDB after save:', error)
        })
      }

      // Restore cursor position and selection after save
      if (editorInstanceRef.current && cursorPosition) {
        const editor = editorInstanceRef.current as {
          getPosition: () => unknown
          getSelection: () => { isEmpty: () => boolean }
          setPosition: (pos: unknown) => void
          setSelection: (sel: unknown) => void
          focus: () => void
        }
        setTimeout(() => {
          editor.setPosition(cursorPosition)
          if (selection && !(selection as { isEmpty: () => boolean }).isEmpty()) {
            editor.setSelection(selection)
          }
          editor.focus()
        }, 50)
      }

      // Clear success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (error) {
      console.error('[CodePanel] Error saving file:', error)
      setSaveError(error instanceof Error ? error.message : 'Failed to save file')

      // Clear error message after 5 seconds
      setTimeout(() => setSaveError(null), 5000)
    } finally {
      setIsSaving(false)
      setTimeout(() => {
        isSavingRef.current = false
      }, 1000)
    }
  }, [projectId, selectedFilePath, fileContent])

  // Add keyboard shortcut for saving (Cmd+S or Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (canEdit && fileContent && selectedFilePath && projectId) {
          saveFile()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [canEdit, fileContent, selectedFilePath, projectId, saveFile])

  const toggleFolder = useCallback((folderPath: string) => {
    setExpandedFolders((prev) => {
      const newExpanded = new Set(prev)
      if (newExpanded.has(folderPath)) {
        newExpanded.delete(folderPath)
      } else {
        newExpanded.add(folderPath)
      }
      return newExpanded
    })
  }, [])

  const handleFileClick = useCallback(
    (filePath: string) => {
      if (filePath !== selectedFilePath) {
        fetchFileContent(filePath)
      }
    },
    [selectedFilePath, fetchFileContent]
  )

  const renderFileTree = useCallback(
    (items: FileItem[], depth = 0) => {
      return items.map((item) => {
        const isFolder = item.type === 'folder'
        const isExpanded = expandedFolders.has(item.path)
        const isSelected = selectedFilePath === item.path

        return (
          <div key={item.path}>
            <div
              className={`flex items-center py-1.5 px-2 rounded cursor-pointer hover:bg-muted transition-colors ${
                isSelected ? 'bg-muted border-l-2 border-primary' : ''
              }`}
              style={{
                paddingLeft: `${depth * 20 + 8}px`,
              }}
              onClick={() => (isFolder ? toggleFolder(item.path) : handleFileClick(item.path))}
            >
              <div className="flex items-center flex-1 min-w-0">
                {isFolder ? (
                  <>
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 mr-1 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 mr-1 flex-shrink-0" />
                    )}
                    <Folder className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                  </>
                ) : (
                  <div className="ml-5">
                    <FileCode className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0 inline" />
                  </div>
                )}
                <span className="text-sm truncate">{item.name}</span>
              </div>
            </div>
            {isFolder && isExpanded && item.children && (
              <div>{renderFileTree(item.children, depth + 1)}</div>
            )}
          </div>
        )
      })
    },
    [expandedFolders, selectedFilePath, toggleFolder, handleFileClick]
  )

  const currentContent = fileContent || code || appData?.code || ''
  const currentFilePath = selectedFilePath || currentFile || appData?.file_path || ''

  return (
    <div className={cn('flex flex-col h-full', !hideHeader && 'border-r')}>
      {!hideHeader && (
        <div className="p-4 border-b h-[50px] flex items-center">
          <div className="flex items-center justify-between w-full">
            <h2 className="font-semibold flex items-center">
              <FileCode className="h-5 w-5 mr-2" />
              Code Editor
            </h2>
            <div className="flex items-center space-x-2">
              {canEdit && fileContent && selectedFilePath && (
                <Button variant="default" size="sm" onClick={saveFile} disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save'
                  )}
                </Button>
              )}
              {projectId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshClick}
                  disabled={isLoadingStructure}
                  className="hidden"
                >
                  <RefreshCw
                    className={`h-4 w-4 mr-2 ${isLoadingStructure ? 'animate-spin' : ''}`}
                  />
                  Refresh
                </Button>
              )}
              <Button
                variant={disableErrorSquiggles ? 'default' : 'outline'}
                size="sm"
                className="hidden"
                onClick={() => setDisableErrorSquiggles(!disableErrorSquiggles)}
                title={
                  disableErrorSquiggles
                    ? 'Error squiggles disabled - Click to enable'
                    : 'Error squiggles enabled - Click to disable'
                }
              >
                {disableErrorSquiggles ? 'Errors Off' : 'Errors On'}
              </Button>
              <Button variant="outline" size="sm" onClick={copyToClipboard}>
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* File Explorer */}
        <div className="w-64 border-r bg-muted/30">
          <div className="p-3 border-b">
            <div
              className="flex items-center cursor-pointer"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 mr-1" />
              ) : (
                <ChevronRight className="h-4 w-4 mr-1" />
              )}
              <Folder className="h-4 w-4 mr-2" />
              <span className="text-sm font-medium">
                {projectId ? 'Project Files' : 'project'}
              </span>
              {isLoadingStructure && <RefreshCw className="h-3 w-3 ml-2 animate-spin" />}
            </div>
          </div>

          {isExpanded && (
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {projectId ? (
                  fileStructure.length > 0 ? (
                    renderFileTree(fileStructure)
                  ) : isPolling || isLoadingStructure ? (
                    <div className="text-center text-muted-foreground p-4">
                      <RefreshCw className="h-4 w-4 mx-auto mb-2 animate-spin" />
                      <p className="text-sm">Loading project files...</p>
                      <p className="text-xs mt-1">This may take a minute or two</p>
                    </div>
                  ) : structureError ? (
                    <div className="text-center text-muted-foreground p-4 text-xs">
                      <p className="mb-2">Unable to load files</p>
                      <p className="text-xs opacity-70">
                        Files will appear once the project is set up
                      </p>
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground p-4">No files found</div>
                  )
                ) : (
                  <div className="text-center text-muted-foreground p-4 text-xs">
                    No project selected
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Code Editor */}
        <div className="flex-1 flex flex-col">
          <div className="p-3 border-b bg-muted/30">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <FileCode className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {currentFilePath || 'No file selected'}
                  </span>
                  {isLoadingFile && <RefreshCw className="h-3 w-3 animate-spin" />}
                </div>
                <div className="flex items-center space-x-2">
                  {saveSuccess && (
                    <Badge variant="default" className="bg-green-500 text-white">
                      Saved!
                    </Badge>
                  )}
                  {saveError && (
                    <Badge variant="destructive" className="text-xs">
                      Save failed
                    </Badge>
                  )}
                  {fileContent && selectedFilePath && (
                    <Button variant="default" size="sm" onClick={saveFile} disabled={isSaving}>
                      {isSaving ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save'
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            {currentContent ? (
              <Editor
                key={`${editorKey}-${disableErrorSquiggles}`}
                height="100%"
                language={getLanguageFromPath(currentFilePath)}
                value={currentContent}
                onChange={(value) => {
                  if (canEdit) {
                    if (fileContent) {
                      setFileContent(value || '')
                    } else {
                      onCodeChange?.(value || '')
                    }
                  }
                }}
                beforeMount={(monaco) => {
                  monaco.editor.defineTheme('github-light', githubLightTheme as Parameters<typeof monaco.editor.defineTheme>[1])
                  monaco.editor.defineTheme('github-dark', githubDarkTheme as Parameters<typeof monaco.editor.defineTheme>[1])

                  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
                    noSemanticValidation: disableErrorSquiggles,
                    noSyntaxValidation: disableErrorSquiggles,
                    noSuggestionDiagnostics: disableErrorSquiggles,
                  })
                  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
                    noSemanticValidation: disableErrorSquiggles,
                    noSyntaxValidation: disableErrorSquiggles,
                    noSuggestionDiagnostics: disableErrorSquiggles,
                  })
                  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
                    validate: !disableErrorSquiggles,
                    allowComments: true,
                    schemas: [],
                  })
                }}
                onMount={(editor, monaco) => {
                  editorInstanceRef.current = editor

                  // Override Cmd+S / Ctrl+S in Monaco to prevent browser default
                  // and dispatch to the window-level save handler
                  editor.addCommand(
                    monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
                    () => {
                      window.dispatchEvent(
                        new KeyboardEvent('keydown', {
                          key: 's',
                          code: 'KeyS',
                          metaKey: true,
                          ctrlKey: true,
                          bubbles: true,
                          cancelable: true,
                        })
                      )
                    }
                  )

                  if (disableErrorSquiggles) {
                    monaco.editor.setModelMarkers(editor.getModel()!, 'owner', [])
                    const model = editor.getModel()
                    if (model) {
                      const originalSetMarkers = monaco.editor.setModelMarkers
                      monaco.editor.setModelMarkers = function (
                        model: Parameters<typeof monaco.editor.setModelMarkers>[0],
                        owner: string,
                        markers: Parameters<typeof monaco.editor.setModelMarkers>[2]
                      ) {
                        if (disableErrorSquiggles) {
                          return originalSetMarkers.call(this, model, owner, [])
                        }
                        return originalSetMarkers.call(this, model, owner, markers)
                      }
                    }
                  }

                  // Set up global callback for positioning editor cursor
                  const win = window as unknown as {
                    __positionEditorCallback?: (l: number, c: number, e?: number) => void
                  }
                  win.__positionEditorCallback = (
                    lineNumber: number,
                    columnStart: number,
                    columnEnd?: number
                  ) => {
                    editor.setPosition({ lineNumber, column: columnStart })
                    editor.revealLineInCenter(lineNumber)

                    if (columnEnd && columnEnd > columnStart) {
                      editor.setSelection({
                        startLineNumber: lineNumber,
                        startColumn: columnStart,
                        endLineNumber: lineNumber,
                        endColumn: columnEnd,
                      })
                    }

                    editor.focus()
                  }

                  const handlePositionEvent = (event: CustomEvent) => {
                    const { lineNumber, columnStart, columnEnd } = event.detail
                    if (lineNumber && columnStart && win.__positionEditorCallback) {
                      win.__positionEditorCallback(lineNumber, columnStart, columnEnd)
                    }
                  }

                  window.addEventListener('positionEditor', handlePositionEvent as EventListener)

                  return () => {
                    editorInstanceRef.current = null
                    delete win.__positionEditorCallback
                    window.removeEventListener(
                      'positionEditor',
                      handlePositionEvent as EventListener
                    )
                  }
                }}
                options={{
                  readOnly: !canEdit,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 14,
                  lineNumbers: 'on',
                  wordWrap: 'on',
                  automaticLayout: true,
                  glyphMargin: true,
                  folding: true,
                  renderValidationDecorations: disableErrorSquiggles ? 'off' : 'on',
                }}
                theme={theme === 'light' ? 'github-light' : 'github-dark'}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground p-4">
                <div className="text-center">
                  {projectId && (isPolling || isLoadingStructure) && fileStructure.length === 0 ? (
                    <>
                      <p className="text-lg font-medium mb-2">Generating code...</p>
                      <p className="text-sm">
                        Setting up your project files. This may take a minute or two.
                      </p>
                    </>
                  ) : (
                    <>
                      <FileCode className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium mb-2">
                        {projectId ? 'Select a file to view' : 'No code generated yet'}
                      </p>
                      <p className="text-sm">
                        {projectId
                          ? 'Click on any file in the explorer to view its contents'
                          : 'Start a conversation with the AI to generate code'}
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})
