import React, { useState, useEffect } from 'react'
import {
  Modal,
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
} from 'react-native'
import { useDotConfig } from './DotContext'
import { HomeScreen } from './HomeScreen'
import { ChatScreen } from './ChatScreen'
import { generateAPIUrl, dotFetch } from './api'
import { SafeAreaView } from 'react-native'

interface DotModalProps {
  visible: boolean
  onClose: () => void
}

type Screen = 'home' | 'chat'

interface Project {
  id: string
  title: string
  template: string
  status: string
  createdAt: string
  updatedAt: string
  ngrokUrl?: string
}

export function DotModal({ visible, onClose }: DotModalProps) {
  const { projectId, apiBaseUrl } = useDotConfig()
  const [currentScreen, setCurrentScreen] = useState<Screen>('chat')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [isLoadingProject, setIsLoadingProject] = useState(false)
  const [hasLoadedProject, setHasLoadedProject] = useState(false)

  // Load project from projectId when modal opens
  useEffect(() => {
    const loadProject = async () => {
      if (!projectId || !visible || hasLoadedProject) {
        return
      }

      console.log('[Dot] Loading project:', projectId)
      setIsLoadingProject(true)

      try {
        const url = generateAPIUrl(apiBaseUrl, `/api/projects/${projectId}`)
        const response = await dotFetch(url)
        const data = await response.json()

        if (data.project) {
          console.log('[Dot] Project loaded:', data.project)

          if (data.project.ngrokUrl) {
            console.log('[Dot] Project already has ngrokUrl:', data.project.ngrokUrl)
            setSelectedProject(data.project)
            setCurrentScreen('chat')
            setHasLoadedProject(true)
          } else {
            console.log('[Dot] Resuming container to get ngrokUrl...')
            const resumeUrl = generateAPIUrl(apiBaseUrl, '/api/resume-container')
            const resumeResponse = await dotFetch(resumeUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ projectId }),
            })

            console.log('[Dot] Resume response status:', resumeResponse.status)

            if (!resumeResponse.ok) {
              const errorText = await resumeResponse.text()
              console.error('[Dot] Resume failed:', errorText)
              setSelectedProject(data.project)
              setCurrentScreen('chat')
              setHasLoadedProject(true)
              return
            }

            const resumeResult = await resumeResponse.json()
            console.log('[Dot] Resume result:', resumeResult)

            if (resumeResult.success && resumeResult.ngrokUrl) {
              setSelectedProject({
                ...data.project,
                ngrokUrl: resumeResult.ngrokUrl,
              })
            } else {
              console.error('[Dot] Failed to resume container:', resumeResult.error)
              setSelectedProject(data.project)
            }
            setCurrentScreen('chat')
            setHasLoadedProject(true)
          }
        }
      } catch (error) {
        console.error('[Dot] Error loading project:', error)
      } finally {
        setIsLoadingProject(false)
      }
    }

    loadProject()
  }, [projectId, apiBaseUrl, visible, hasLoadedProject])

  const handleSelectProject = (project: Project) => {
    setSelectedProject(project)
    setCurrentScreen('chat')
  }

  const handleNavigateHome = () => {
    setCurrentScreen('home')
  }

  const handleNavigateToChat = () => {
    if (selectedProject) {
      setCurrentScreen('chat')
    }
  }

  const handleClose = () => {
    setCurrentScreen('home')
    setSelectedProject(null)
    setHasLoadedProject(false)
    onClose()
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          {isLoadingProject ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="black" />
              <Text style={styles.loadingText}>Loading project...</Text>
            </View>
          ) : currentScreen === 'home' ? (
            <HomeScreen
              onSelectProject={handleSelectProject}
              currentProject={selectedProject}
              onNavigateToChat={handleNavigateToChat}
              onClose={handleClose}
            />
          ) : (
            <ChatScreen
              onNavigateHome={handleNavigateHome}
              onClose={handleClose}
              selectedProject={selectedProject}
            />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#999',
  },
})
