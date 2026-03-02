// API endpoint to enable Cloud (Convex) for a project
// This injects the convex folder, provisions the project, and starts the dev server

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { projects, convexProjectCredentials } from '@react-native-vibe-code/database'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth/config'
import { headers } from 'next/headers'
import { Sandbox } from '@e2b/code-interpreter'
import { connectSandbox } from '@/lib/sandbox-connect'
import { pusherServer } from '@/lib/pusher'
import { provisionManagedConvexProject } from '@/lib/convex/management-api'
import { updateSandboxEnvFile } from '@/lib/convex/sandbox-utils'
import { startExpoServer } from '@/lib/server-utils'

// Convex root config file
const CONVEX_JSON = `{
  "functions": "convex/"
}
`

// Convex template files content
const CONVEX_TEMPLATES = {
  'schema.ts': `// Convex schema - Define your database tables here
// IMPORTANT: NEVER name an index "by_creation_time" because the name is reserved.
// Indexes may not start with an underscore or be named "by_id" or "by_creation_time".
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// Define your database tables here
// Example:
// export default defineSchema({
//   users: defineTable({
//     name: v.string(),
//     email: v.string(),
//   }),
// })

export default defineSchema({
  // Add your tables here
})
`,
  'auth.config.ts': `// Convex Auth configuration
// This file configures authentication for your Convex backend

export default {
  providers: [
    // Add your auth providers here
    // Example: Google, GitHub, Email/Password, etc.
  ],
}
`,
  'http.ts': `// Convex HTTP actions
// Define HTTP endpoints for your backend here

import { httpRouter } from 'convex/server'

const http = httpRouter()

// Example: Add HTTP routes here
// http.route({
//   path: '/hello',
//   method: 'GET',
//   handler: httpAction(async () => {
//     return new Response('Hello World!')
//   }),
// })

export default http
`,
  'tsconfig.json': `{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["ES2021"],
    "target": "ES2021",
    "types": [],
    "jsx": "preserve"
  },
  "include": ["."],
  "exclude": []
}
`,
}

// Convex code to inject into _layout.tsx
const CONVEX_IMPORTS = `import { ConvexProvider, ConvexReactClient } from 'convex/react'

// Initialize Convex client
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL
const convex = convexUrl
  ? new ConvexReactClient(convexUrl, { unsavedChangesWarning: false })
  : null

// Wrapper to conditionally include ConvexProvider
function ConvexWrapper({ children }: { children: React.ReactNode }) {
  if (convex) {
    return <ConvexProvider client={convex}>{children}</ConvexProvider>
  }
  return <>{children}</>
}
`

/**
 * Injects Convex code into the _layout.tsx file
 * - Adds Convex imports after existing imports
 * - Wraps ThemeProvider with ConvexWrapper
 */
async function injectConvexIntoLayout(sandbox: Sandbox): Promise<void> {
  const layoutPath = '/home/user/app/app/_layout.tsx'

  // Read current layout file
  const currentContent = await sandbox.files.read(layoutPath)

  // Check if Convex is already injected
  if (currentContent.includes('ConvexProvider') || currentContent.includes('ConvexWrapper')) {
    console.log('[Cloud Enable] Convex already present in _layout.tsx, skipping injection')
    return
  }

  let newContent = currentContent

  // Find the last import statement and inject Convex imports after it
  const importRegex = /^import .+$/gm
  let lastImportMatch: RegExpExecArray | null = null
  let match: RegExpExecArray | null
  while ((match = importRegex.exec(currentContent)) !== null) {
    lastImportMatch = match
  }

  if (lastImportMatch) {
    const insertPosition = lastImportMatch.index + lastImportMatch[0].length
    newContent =
      currentContent.slice(0, insertPosition) +
      '\n' + CONVEX_IMPORTS +
      currentContent.slice(insertPosition)
  } else {
    // No imports found, add at the beginning
    newContent = CONVEX_IMPORTS + '\n' + currentContent
  }

  // Wrap ThemeProvider with ConvexWrapper
  // Find the pattern: <ThemeProvider ...>
  newContent = newContent.replace(
    /(<ThemeProvider\s+value=\{[^}]+\}>)/,
    '<ConvexWrapper>\n          $1'
  )

  // Find the closing </ThemeProvider> and add </ConvexWrapper> after it
  // We need to find the right </ThemeProvider> (the one that closes the main theme provider)
  newContent = newContent.replace(
    /(<\/ThemeProvider>)(\s*<\/ReloadProvider>)/,
    '$1\n        </ConvexWrapper>$2'
  )

  // Write the modified content back
  await sandbox.files.write(layoutPath, newContent)
  console.log('[Cloud Enable] Injected Convex code into _layout.tsx')
}

// Buffer for accumulating multi-line Convex error messages
const convexErrorBuffers = new Map<string, { buffer: string; timeout: NodeJS.Timeout | null }>()

const CONVEX_ERROR_PATTERNS = [
  /error:/i,
  /Error:/,
  /failed to/i,
  /Unable to/i,
  /Cannot find/i,
  /is not defined/i,
  /ValidationError/i,
  /TypeError:/i,
  /SyntaxError:/i,
  /✖/,
]

function sendConvexError(projectId: string, logData: string): void {
  if (!projectId) return

  const hasError = CONVEX_ERROR_PATTERNS.some(pattern => pattern.test(logData))

  if (logData.includes('Convex functions ready') ||
      logData.includes('✔') ||
      logData.includes('Watching for changes') ||
      logData.includes('bunx convex dev')) {
    return
  }

  let bufferData = convexErrorBuffers.get(projectId)
  if (!bufferData) {
    bufferData = { buffer: '', timeout: null }
    convexErrorBuffers.set(projectId, bufferData)
  }

  if (hasError) {
    console.log('[Cloud Enable] Convex error detected:', logData.substring(0, 200))

    if (bufferData.timeout) {
      clearTimeout(bufferData.timeout)
    }

    bufferData.buffer += logData + '\n'

    bufferData.timeout = globalThis.setTimeout(() => {
      const cleanError = bufferData!.buffer
        .replace(/\x1b\[[0-9;]*m/g, '')
        .trim()

      if (cleanError.length > 0) {
        const channelName = `${projectId}-errors`
        pusherServer.trigger(channelName, 'error-notification', {
          message: cleanError,
          timestamp: new Date().toISOString(),
          projectId,
          type: 'convex-error',
          source: 'cloud-enable',
        }).catch((error) => {
          console.error('[Cloud Enable] Failed to send error notification:', error)
        })
      }

      bufferData!.buffer = ''
      bufferData!.timeout = null
    }, 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { projectId } = body

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
    }

    // Check if Convex is configured
    const teamScopedToken = process.env.CONVEX_TEAM_SCOPED_TOKEN
    const teamSlug = process.env.CONVEX_TEAM_SLUG

    if (!teamScopedToken || !teamSlug) {
      return NextResponse.json({ error: 'Cloud backend is not configured on this server' }, { status: 503 })
    }

    // Get project
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, session.user.id)))
      .limit(1)

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (!project.sandboxId) {
      return NextResponse.json({ error: 'No sandbox found for this project. Please wait for the container to be created.' }, { status: 400 })
    }

    // Check if already enabled
    const convexProject = project.convexProject as any
    if (convexProject?.kind === 'connected') {
      return NextResponse.json({ error: 'Cloud is already enabled for this project' }, { status: 400 })
    }

    // Connect to sandbox
    console.log('[Cloud Enable] Connecting to sandbox:', project.sandboxId)
    const sandbox = await connectSandbox(project.sandboxId)

    // Step 1: Create the convex folder and write template files
    console.log('[Cloud Enable] Creating convex folder and writing template files...')

    // Write convex.json config file
    await sandbox.files.write('/home/user/app/convex.json', CONVEX_JSON)
    console.log('[Cloud Enable] Wrote /home/user/app/convex.json')

    // Create the convex directory
    await sandbox.commands.run('mkdir -p /home/user/app/convex', { timeoutMs: 10000 })

    // Write each template file
    for (const [filename, content] of Object.entries(CONVEX_TEMPLATES)) {
      const filePath = `/home/user/app/convex/${filename}`
      await sandbox.files.write(filePath, content)
      console.log(`[Cloud Enable] Wrote ${filePath}`)
    }

    // Step 1.5: Inject Convex code into _layout.tsx
    console.log('[Cloud Enable] Injecting Convex code into _layout.tsx...')
    await injectConvexIntoLayout(sandbox)

    // Step 2: Provision the Convex project
    console.log('[Cloud Enable] Provisioning Convex project...')

    const appName = project.title || 'app'
    const convexProjectName = `${appName.replace(/[^a-zA-Z0-9-]/g, '-')}-${projectId.substring(0, 8)}`

    const convexProjectData = await provisionManagedConvexProject({
      teamScopedToken,
      teamSlug,
      projectName: convexProjectName,
    })

    console.log('[Cloud Enable] Convex project provisioned:', convexProjectData.deploymentUrl)

    // Step 3: Store credentials
    await db.insert(convexProjectCredentials).values({
      projectId: projectId,
      userId: session.user.id,
      mode: 'managed',
      teamSlug: convexProjectData.teamSlug,
      projectSlug: convexProjectData.projectSlug,
      deploymentUrl: convexProjectData.deploymentUrl,
      deploymentName: convexProjectData.deploymentName,
      adminKey: convexProjectData.token,
      accessToken: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Step 4: Update project state
    await db
      .update(projects)
      .set({
        convexProject: {
          kind: 'connected',
          projectSlug: convexProjectData.projectSlug,
          teamSlug: convexProjectData.teamSlug,
          deploymentUrl: convexProjectData.deploymentUrl,
          deploymentName: convexProjectData.deploymentName,
        },
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))

    // Step 5: Write EXPO_PUBLIC_CONVEX_URL to sandbox .env.local
    await updateSandboxEnvFile(sandbox, 'EXPO_PUBLIC_CONVEX_URL', convexProjectData.deploymentUrl)

    // Step 5.5: Commit the Convex setup changes to git
    console.log('[Cloud Enable] Committing Convex setup changes to git...')
    try {
      await sandbox.commands.run(
        'cd /home/user/app && git add convex.json convex/ app/_layout.tsx .env.local && git commit -m "Enable Convex cloud backend"',
        { timeoutMs: 30000 }
      )
      console.log('[Cloud Enable] Git commit successful')
    } catch (error) {
      console.error('[Cloud Enable] Git commit failed (non-fatal):', error)
      // Don't fail the whole operation if git commit fails
    }

    // Step 5.6: Restart Expo server to pick up the new EXPO_PUBLIC_CONVEX_URL env variable
    // Metro bundles env vars at build time, so we need to restart the server
    console.log('[Cloud Enable] Restarting Expo server to pick up new env variables...')
    try {
      await startExpoServer(sandbox, projectId)
      console.log('[Cloud Enable] Expo server restarted successfully')
    } catch (error) {
      console.error('[Cloud Enable] Failed to restart Expo server:', error)
      // Don't fail the whole operation if Expo restart fails
    }

    // Step 6: Start Convex dev server
    console.log('[Cloud Enable] Starting Convex dev server...')

    sandbox.commands.run(
      `cd /home/user/app && bunx convex dev --url "${convexProjectData.deploymentUrl}" --admin-key "${convexProjectData.token}" --typecheck=disable`,
      {
        background: true,
        timeoutMs: 3600000, // 1 hour
        onStdout: (data: string) => {
          console.log('[Cloud Enable] stdout:', data)
          sendConvexError(projectId, data)
        },
        onStderr: (data: string) => {
          console.log('[Cloud Enable] stderr:', data)
          sendConvexError(projectId, data)
        },
      }
    )

    // Update convexDevRunning status
    await db
      .update(projects)
      .set({
        convexDevRunning: true,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))

    console.log('[Cloud Enable] Cloud enabled successfully')

    return NextResponse.json({
      success: true,
      message: 'Cloud enabled successfully',
      deploymentUrl: convexProjectData.deploymentUrl,
    })
  } catch (error) {
    console.error('[Cloud Enable] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to enable cloud'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
