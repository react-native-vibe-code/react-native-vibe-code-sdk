import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { FragmentSchema } from '@/lib/schema'
import { ExecutionResultInterpreter, ExecutionResultWeb } from '@/lib/types'
import { getSandboxProvider, type ISandbox } from '@react-native-vibe-code/sandbox/lib'
import { eq, and } from 'drizzle-orm'
import { globalFileWatcher } from '@/lib/sandbox-file-watcher'
import { globalFileChangeStream } from '@/lib/file-change-stream'

const sandboxTimeout = parseInt(process.env.SANDBOX_TIMEOUT_MS || process.env.E2B_SANDBOX_TIMEOUT_MS || '3600000') // Use env var, default to 1 hour

export const maxDuration = 120

// Generate project title from fragment code or description
function generateProjectTitle(fragment: FragmentSchema): string {
  // Extract title from the code or use template as fallback
  if (fragment.code && typeof fragment.code === 'string') {
    // Try to extract title from comments or component names
    const lines = fragment.code.split('\n').slice(0, 10)
    for (const line of lines) {
      const comment = line.match(/\/\/\s*(.+)|\/\*\s*(.+)\s*\*\//)
      if (comment && comment[1]) {
        const title = comment[1].trim()
        if (title.length > 5 && title.length < 50) {
          return title
        }
      }
    }

    // Try to extract component name
    const componentMatch = fragment.code.match(
      /(?:function|const|class)\s+([A-Z][a-zA-Z0-9]+)/,
    )
    if (componentMatch && componentMatch[1]) {
      return componentMatch[1]
    }
  }

  // Fallback to template-based title
  return `${fragment.template.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase())} Project`
}

// Template-specific file path resolution for proper project structure
function getTemplateFilePath(
  template: string,
  aiGeneratedPath: string,
): string {
  return '/home/user/app/app/(tabs)/index.tsx'
  switch (template) {
    case 'react-native-expo':
      // For React Native Expo, ensure files are in the correct app directory
      if (aiGeneratedPath === 'App.tsx' || aiGeneratedPath === './App.tsx') {
        return '/home/user/app/App.tsx'
      }
      // Handle app/(tabs) structure for Expo Router
      if (aiGeneratedPath.startsWith('app/')) {
        return `/home/user/${aiGeneratedPath}`
      }
      // Handle component files
      if (aiGeneratedPath.includes('components/')) {
        return `/home/user/app/${aiGeneratedPath}`
      }
      // Handle screen files
      if (aiGeneratedPath.includes('screens/')) {
        return `/home/user/app/${aiGeneratedPath}`
      }
      // Default to app directory for any other files
      return `/home/user/app/${aiGeneratedPath.replace(/^\.\//, '')}`

    case 'nextjs-developer':
      // For Next.js, ensure proper pages structure
      if (aiGeneratedPath.includes('pages/')) {
        return aiGeneratedPath
      }
      return `pages/${aiGeneratedPath}`

    case 'code-interpreter-v1':
      // Python files can be at root
      return aiGeneratedPath

    default:
      // For other templates, use as-is
      return aiGeneratedPath
  }
}

export async function POST(req: Request) {
  const {
    fragment,
    userID,
    teamID,
    accessToken,
    projectId,
    isFirstMessage,
  }: {
    fragment: FragmentSchema
    userID: string | undefined
    teamID: string | undefined
    accessToken: string | undefined
    projectId?: string
    isFirstMessage?: boolean
  } = await req.json()
  console.log('fragment', fragment)
  console.log('userID', userID)
  console.log('teamID', teamID)
  console.log('projectId', projectId)
  console.log('isFirstMessage', isFirstMessage)

  if (!userID) {
    return new Response(JSON.stringify({ error: 'User ID is required' }), {
      status: 400,
    })
  }

  if (isFirstMessage && !projectId) {
    return new Response(
      JSON.stringify({ error: 'Project ID is required for first message' }),
      {
        status: 400,
      },
    )
  }

  let project = null
  let sbx: ISandbox | null = null

  const sandboxProvider = getSandboxProvider()

  // Check if this is a follow-up message for an existing project
  if (projectId && !isFirstMessage) {
    try {
      const existingProjects = await db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, projectId),
            eq(projects.userId, userID),
            eq(projects.status, 'active'),
          ),
        )
        .limit(1)

      if (existingProjects.length > 0) {
        project = existingProjects[0]
        console.log(
          `Found existing project: ${project.id} with sandbox: ${project.sandboxId}`,
        )

        // Try to connect to the existing sandbox
        if (project.sandboxId) {
          try {
            sbx = await sandboxProvider.connect(project.sandboxId)
            console.log(`Connected to sandbox: ${sbx.sandboxId}`)
          } catch (connectError) {
            console.log(
              `Failed to connect to sandbox ${project.sandboxId}:`,
              connectError,
            )
            // If connect fails, we'll create a new sandbox below
          }
        }
      }
    } catch (error) {
      console.log('Error checking for existing project:', error)
    }
  }

  // Create new sandbox if we don't have one already
  if (!sbx) {
    const templateId =
      fragment.template === 'react-native-expo'
        ? 'sm3r39vktkmu37lna0qa'
        : fragment.template

    sbx = await sandboxProvider.create({
      templateId,
      image: process.env.DAYTONA_IMAGE,
      metadata: {
        template: templateId,
        userID: userID ?? '',
        teamID: teamID ?? '',
      },
      timeoutMs: sandboxTimeout,
    })

    console.log(`Sandbox created: ${sbx.sandboxId} for template: ${templateId}`)

    // Create or update project in database
    if (isFirstMessage || !project) {
      const title = generateProjectTitle(fragment)

      try {
        const newProjects = await db
          .insert(projects)
          .values({
            id: projectId || crypto.randomUUID(), // Use provided ID or generate new one
            title,
            userId: userID,
            teamId: teamID || null,
            sandboxId: sbx.sandboxId,
            template: fragment.template,
            status: 'active',
          })
          .returning()

        project = newProjects[0]
        console.log(`Created new project: ${project.id} with title: ${title}`)
      } catch (error) {
        console.log('Error creating project:', error)
      }
    } else if (project && !project.sandboxId) {
      // Update existing project with new sandbox ID
      try {
        await db
          .update(projects)
          .set({
            sandboxId: sbx.sandboxId,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, project.id))

        console.log(
          `Updated project ${project.id} with new sandbox ${sbx.sandboxId}`,
        )
      } catch (error) {
        console.log('Error updating project:', error)
      }
    }
  } else {
    console.log(`Using existing sandbox: ${sbx.sandboxId}`)
  }

  let publicUrl: string

  // Handle React Native Expo specific setup
  if (fragment.template === 'react-native-expo') {
    // Check available scripts
    const scriptsResult = await sbx.commands.run('cd /home/user/app && bun run')
    console.log(`Available scripts:`, scriptsResult.stdout)

    // Check if the server is running
    const statusResult = await sbx.commands.run(
      'curl -s http://localhost:8081 || echo "Server not ready"',
    )
    console.log(`Server status check: ${statusResult.stdout}`)

    // Start Expo web server
    console.log('Starting Expo web server...')

    let serverOutput = ''
    let webBundled = false

    // Start the web server in background
    sbx.commands
      .run('cd /home/user/app && bunx expo start --web', {
        requestTimeoutMs: 300000,
        timeoutMs: 300000,
        background: true,
        onStdout: (data: string) => {
          console.log('SERVER STDOUT:', data)
          serverOutput += data

          // Check for Web Bundled specifically
          if (data.includes('Web Bundled')) {
            console.log('Web Bundled: true')
            webBundled = true
          }
        },
        onStderr: (data: string) => {
          console.log('SERVER STDERR:', data)
          serverOutput += data
        },
      })
      .catch((err: any) => console.log('Server process error:', err))

    console.log('Waiting for server to start...')

    // Wait for webBundled with timeout and health checks
    const maxWaitTime = 120000 // 120 seconds
    const checkInterval = 3000 // 3 seconds
    let waitTime = 0

    while (!webBundled && waitTime < maxWaitTime) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval))
      waitTime += checkInterval

      // Try to ping the server directly
      try {
        const healthCheck = await sbx.commands.run(
          'curl -s -o /dev/null -w "%{http_code}" http://localhost:8081 || echo "000"',
          { timeoutMs: 13000 },
        )

        if (
          healthCheck.stdout.includes('200') ||
          healthCheck.stdout.includes('404')
        ) {
          console.log('Server responding to HTTP requests')
          webBundled = true
          break
        }
      } catch (error) {
        console.log('Health check failed:', error)
      }

      console.log(`Still waiting for webBundled... ${waitTime}ms elapsed`)
    }

    // Get the public URL - try async getPreviewUrl first, fall back to sync getHost
    if (sbx.getPreviewUrl) {
      publicUrl = await sbx.getPreviewUrl(8081)
    } else {
      publicUrl = `https://${sbx.getHost(8081)}`
    }

    console.log('Sandbox public URL:', publicUrl)

    if (!webBundled) {
      console.warn('WebBundled not detected, but proceeding with URL')
    }
  } else {
    // For other templates, use the standard port
    const port = fragment.port || 80
    if (sbx?.getPreviewUrl) {
      publicUrl = await sbx.getPreviewUrl(port)
    } else {
      publicUrl = `https://${sbx?.getHost(port)}`
    }
  }

  // Install packages
  if (fragment.has_additional_dependencies) {
    await sbx.commands.run(fragment.install_dependencies_command)
    console.log(
      `Installed dependencies: ${fragment.additional_dependencies.join(', ')} in sandbox ${sbx.sandboxId}`,
    )
  }

  // Copy code to fs
  console.log('>> fragment', fragment)

  // Log initial folder structure
  try {
    const initialStructure = await sbx.commands.run(
      'find /home/user -type f -name "*.tsx" -o -name "*.ts" | head -20',
    )
    console.log(
      'Initial folder structure (TS/TSX files):',
      initialStructure.stdout,
    )
  } catch (error) {
    console.log('Error checking initial structure:', error)
  }

  if (fragment.code && Array.isArray(fragment.code)) {
    console.log('>> on fragment code')
    fragment.code.forEach(async (file) => {
      await sbx.files.write(file.file_path, file.file_content)
      console.log(`Copied file to ${file.file_path} in ${sbx.sandboxId}`)

      // Verify file was written
      try {
        const fileCheck = await sbx.commands.run(
          `ls -la "${file.file_path}" && head -10 "${file.file_path}"`,
        )
        console.log(
          `File verification for ${file.file_path}:`,
          fileCheck.stdout,
        )
      } catch (error) {
        console.log(`Error verifying file ${file.file_path}:`, error)
      }
    })
  } else {
    // Use template-specific file path resolution
    console.log('>> on getTemplateFilePath')
    const resolvedFilePath = getTemplateFilePath(
      fragment.template,
      fragment.file_path,
    )
    console.log(`Writing to resolved path: ${resolvedFilePath}`)
    console.log(
      `Fragment code length: ${fragment.code?.length || 0} characters`,
    )

    await sbx.files.write(resolvedFilePath, fragment.code)
    console.log(`Copied file to ${resolvedFilePath} in ${sbx.sandboxId}`)

    // Verify file was written and show content
    try {
      const fileCheck = await sbx.commands.run(`ls -la "${resolvedFilePath}"`)
      console.log(`File exists check:`, fileCheck.stdout)

      const contentCheck = await sbx.commands.run(
        `head -20 "${resolvedFilePath}"`,
      )
      console.log(`File content (first 20 lines):`, contentCheck.stdout)
    } catch (error) {
      console.log(`Error verifying file ${resolvedFilePath}:`, error)
    }
  }

  // Log final folder structure
  try {
    const finalStructure = await sbx.commands.run(
      'find /home/user -type f -name "*.tsx" -o -name "*.ts" -not -path "*/node_modules/*" | head -20',
    )
    console.log('Final folder structure (TS/TSX files):', finalStructure.stdout)
  } catch (error) {
    console.log('Error checking final structure:', error)
  }

  // Start file watching in the background (non-blocking)
  if (project?.id && sbx) {
    // Don't await this - let it run in the background
    globalFileWatcher.startWatching(
      project.id,
      sbx,
      (event) => {
        console.log(`📝 [Sandbox] File change detected for project ${project.id}:`, event)
        globalFileChangeStream.broadcastFileChange(event).catch(err => 
          console.error('Error broadcasting file change:', err)
        )
      }
    ).then(() => {
      console.log(`✅ [Sandbox] File watcher started for project ${project.id}`)
    }).catch(error => {
      console.error(`❌ [Sandbox] Failed to start file watcher for project ${project.id}:`, error)
    })
  }

  return new Response(
    JSON.stringify({
      sbxId: sbx?.sandboxId,
      template: fragment.template,
      url: publicUrl,
      projectId: project?.id,
      projectTitle: project?.title,
    } as ExecutionResultWeb & { projectId?: string; projectTitle?: string }),
  )
  // return new Response(
  //   JSON.stringify({
  //     sbxId: rnSbx?.sandboxId,
  //     template: fragment.template,
  //     url: publicUrl,
  //   } as ExecutionResultWeb),
  // )
}
