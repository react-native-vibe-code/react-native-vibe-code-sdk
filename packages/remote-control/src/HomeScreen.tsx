import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from 'react-native'
import { useDotConfig } from './DotContext'
import { generateAPIUrl, dotFetch } from './api'
import { MessageSquare, X } from 'lucide-react-native'

interface Project {
  id: string
  title: string
  template: string
  status: string
  createdAt: string
  updatedAt: string
  ngrokUrl?: string
}

interface HomeScreenProps {
  onSelectProject: (project: Project) => void
  currentProject?: Project | null
  onNavigateToChat?: () => void
  onClose: () => void
}

export function HomeScreen({ onSelectProject, currentProject, onNavigateToChat, onClose }: HomeScreenProps) {
  const { apiBaseUrl } = useDotConfig()
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const url = generateAPIUrl(apiBaseUrl, '/api/projects')
      console.log('[HomeScreen] Fetching projects from:', url)

      const response = await dotFetch(url)
      console.log('[HomeScreen] Response status:', response.status)

      const responseText = await response.text()
      console.log('[HomeScreen] Response body:', responseText.substring(0, 200))

      let data
      try {
        data = JSON.parse(responseText)
      } catch (parseError) {
        console.error('[HomeScreen] Failed to parse JSON:', parseError)
        throw new Error(`Invalid response from server: ${responseText.substring(0, 100)}`)
      }

      if (data.error) {
        throw new Error(data.error)
      }

      setProjects(data.projects || [])
    } catch (err) {
      console.error('[HomeScreen] Error fetching projects:', err)
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const [resumingProjectId, setResumingProjectId] = useState<string | null>(null)

  const handleProjectPress = async (project: Project) => {
    try {
      setResumingProjectId(project.id)

      const url = generateAPIUrl(apiBaseUrl, '/api/resume-container')
      console.log('[HomeScreen] Resuming container for project:', project.id)

      const response = await dotFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: project.id,
        }),
      })

      const result = await response.json()
      console.log('[HomeScreen] Resume container result:', result)

      if (result.success && result.ngrokUrl) {
        console.log('[HomeScreen] Successfully resumed project')
        console.log('[HomeScreen] Ngrok URL:', result.ngrokUrl)

        const projectWithUrl = {
          ...project,
          ngrokUrl: result.ngrokUrl,
        }

        onSelectProject(projectWithUrl)

        const baseDeeplinkUrl = result.ngrokUrl.replace('https://', 'exp://')
        const deeplinkUrl = `${baseDeeplinkUrl}?projectId=${encodeURIComponent(project.id)}`
        console.log('[HomeScreen] Opening deeplink with projectId:', deeplinkUrl)
        await Linking.openURL(deeplinkUrl)
      } else {
        console.error('[HomeScreen] Failed to resume container:', result.error)
        setError(result.error || 'Failed to resume sandbox')
      }
    } catch (err) {
      console.error('[HomeScreen] Error resuming sandbox:', err)
      setError(err instanceof Error ? err.message : 'Failed to resume sandbox')
    } finally {
      setResumingProjectId(null)
    }
  }

  const renderProject = ({ item }: { item: Project }) => {
    const isResuming = resumingProjectId === item.id

    return (
      <TouchableOpacity
        style={styles.projectCard}
        onPress={() => handleProjectPress(item)}
        activeOpacity={0.7}
        disabled={isResuming}
      >
        <View style={styles.projectHeader}>
          <Text style={styles.projectTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <View
            style={[
              styles.statusBadge,
              item.status === 'active' ? styles.statusActive : styles.statusInactive,
            ]}
          >
            <Text style={styles.statusText}>
              {isResuming ? 'resuming...' : item.status}
            </Text>
          </View>
        </View>
        <Text style={styles.projectTemplate}>{item.template}</Text>
        <Text style={styles.projectDate}>
          Updated {formatDate(item.updatedAt)}
        </Text>
        {isResuming && (
          <View style={styles.resumingOverlay}>
            <ActivityIndicator size="small" color="black" />
          </View>
        )}
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header with chat icon and close button */}
      <View style={styles.header}>
        {currentProject && onNavigateToChat ? (
          <TouchableOpacity
            style={styles.headerButton}
            onPress={onNavigateToChat}
            activeOpacity={0.7}
          >
            <MessageSquare size={22} color="black" />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerButton} />
        )}
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Your Projects</Text>
        </View>
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.7}
          style={styles.headerButton}
        >
          <X size={22} color="black" />
        </TouchableOpacity>
      </View>

      {/* Projects list */}
      <View style={styles.content}>
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="black" />
            <Text style={styles.loadingText}>Loading projects...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={fetchProjects}
              activeOpacity={0.7}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : projects.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyText}>No projects yet</Text>
            <Text style={styles.emptySubtext}>
              Create your first project to get started
            </Text>
          </View>
        ) : (
          <FlatList
            data={projects}
            renderItem={renderProject}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.projectsList}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
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
  content: {
    flex: 1,
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#c00',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: 'black',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  projectsList: {
    paddingBottom: 20,
  },
  projectCard: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  projectTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    flex: 1,
    marginRight: 12,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  statusActive: {
    backgroundColor: '#e6f7e6',
  },
  statusInactive: {
    backgroundColor: '#f0f0f0',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  projectTemplate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  projectDate: {
    fontSize: 12,
    color: '#999',
  },
  resumingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
})
