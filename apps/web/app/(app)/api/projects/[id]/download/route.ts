import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { eq, and } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { Sandbox } from '@e2b/code-interpreter'
import { connectSandbox } from '@/lib/sandbox-connect'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  console.log('[Download API] Starting download request for project:', id)
  
  const { searchParams } = new URL(req.url)
  const userID = searchParams.get('userID')
  
  console.log('[Download API] UserID:', userID)

  if (!userID) {
    console.error('[Download API] No userID provided')
    return new Response(JSON.stringify({ error: 'User ID is required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    // Fetch project from database
    console.log('[Download API] Fetching project from database...')
    const projectResults = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, id),
          eq(projects.userId, userID)
        )
      )
      .limit(1)

    console.log('[Download API] Found projects:', projectResults.length)

    if (projectResults.length === 0) {
      console.error('[Download API] Project not found or access denied')
      return new Response(JSON.stringify({ error: 'Project not found or access denied' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const project = projectResults[0]
    console.log('[Download API] Project found:', project.id, 'SandboxId:', project.sandboxId)

    if (!project.sandboxId) {
      console.error('[Download API] No sandbox associated with project')
      return new Response(JSON.stringify({ error: 'No sandbox associated with this project' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Connect to sandbox
    let sandbox: Sandbox
    try {
      console.log('[Download API] Connecting to sandbox:', project.sandboxId)
      sandbox = await connectSandbox(project.sandboxId)
      console.log('[Download API] Sandbox connected successfully')
    } catch (error) {
      console.error('[Download API] Failed to connect to sandbox:', error)
      return new Response(JSON.stringify({ error: 'Failed to access project sandbox' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Create a clean _layout.tsx without FloatingChatWrapper
    const cleanLayoutScript = `#!/bin/bash
set -e

cd /home/user/app

# Create a clean version of _layout.tsx
cat > app/_layout.tsx << 'EOF'
import { useColorScheme } from '@/hooks/useColorScheme'
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { LogBox } from 'react-native'

// Ignore the React Fragment id prop warning
LogBox.ignoreLogs([
  'Invalid prop',
  'supplied to \`React.Fragment\`',
])

export default function RootLayout() {
  const colorScheme = useColorScheme()
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  })

  if (!loaded) {
    return null
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="auto" />
    </ThemeProvider>
  )
}
EOF
`

    // Create a zip file of the project directory
    const zipScript = `#!/bin/bash
set -e

cd /home/user

# Install zip if not available
if ! command -v zip &> /dev/null; then
  echo "Installing zip utility..." >&2
  apt-get update >&2 && apt-get install -y zip >&2
fi

# Create a temporary zip file
# Exclude node_modules, .git, specific features subfolders, and other unnecessary files
zip -r project.zip app \
  -x "app/node_modules/*" \
  -x "app/.git/*" \
  -x "app/.next/*" \
  -x "app/build/*" \
  -x "app/dist/*" \
  -x "app/.cache/*" \
  -x "app/.env.local" \
  -x "app/.DS_Store" \
  -x "app/Thumbs.db" \
  -x "*/.__pycache__/*" \
  -x "*/.pytest_cache/*" \
  -x "app/android/.gradle/*" \
  -x "app/android/build/*" \
  -x "app/ios/build/*" \
  -x "app/ios/Pods/*" \
  -x "app/features/element-edition/*" \
  -x "app/features/floating-chat/*" \
  -x "app/contexts/AuthContext.tsx" \
  -x "app/hooks/useHoverWithChannel.ts" \
  -x "app/patches/*" >&2

# Output the zip file as base64 without line breaks for proper decoding
base64 -w 0 /home/user/project.zip
`

    try {
      // First check what's in the home directory
      console.log('[Download API] Checking directory structure...')
      const lsCheck = await sandbox.commands.run('ls -la /home/user/', {
        timeoutMs: 5000,
      })
      console.log('[Download API] Directory listing:', lsCheck.stdout?.substring(0, 500))

      // Create clean _layout.tsx before zipping
      console.log('[Download API] Creating clean _layout.tsx...')
      const cleanLayoutExecution = await sandbox.commands.run(cleanLayoutScript, {
        timeoutMs: 10000,
      })

      if (cleanLayoutExecution.exitCode !== 0) {
        console.error('[Download API] Failed to create clean _layout.tsx:', cleanLayoutExecution.stderr)
      } else {
        console.log('[Download API] Clean _layout.tsx created successfully')
      }

      // Check if zip is available
      console.log('[Download API] Checking if zip command is available...')
      const zipCheck = await sandbox.commands.run('command -v zip || echo "zip not found"', {
        timeoutMs: 5000,
      })
      console.log('[Download API] Zip check result:', zipCheck.stdout?.trim(), 'Exit code:', zipCheck.exitCode)

      console.log('[Download API] Running zip script...')
      const execution = await sandbox.commands.run(zipScript, {
        timeoutMs: 60000, // 1 minute timeout
      })

      console.log('[Download API] Zip script exit code:', execution.exitCode)
      console.log('[Download API] Stdout:', execution.stdout?.substring(0, 500))
      console.log('[Download API] Stderr:', execution.stderr)
      
      if (execution.exitCode !== 0) {
        console.error('[Download API] Failed to create zip. Exit code:', execution.exitCode)
        console.error('[Download API] Full stderr:', execution.stderr)
        console.error('[Download API] Full stdout:', execution.stdout)
        return new Response(JSON.stringify({ 
          error: 'Failed to create project archive',
          details: execution.stderr || 'Unknown error'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      // Convert base64 back to binary
      console.log('[Download API] Converting base64 to binary...')
      const base64Data = execution.stdout.trim()
      console.log('[Download API] Base64 data length:', base64Data.length)
      
      // Validate base64 data
      if (!base64Data || base64Data.length === 0) {
        console.error('[Download API] No base64 data received')
        return new Response(JSON.stringify({ 
          error: 'Failed to create project archive',
          details: 'No data received from archive creation'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      
      const binaryData = Buffer.from(base64Data, 'base64')
      console.log('[Download API] Binary data size:', binaryData.length, 'bytes')
      
      // Validate the zip file by checking magic numbers
      if (binaryData.length < 4 || (binaryData[0] !== 0x50 || binaryData[1] !== 0x4B)) {
        console.error('[Download API] Invalid zip file magic numbers:', binaryData.slice(0, 4))
        console.error('[Download API] First 100 chars of base64:', base64Data.substring(0, 100))
      }

      // Clean up the zip file from sandbox
      console.log('[Download API] Cleaning up temporary files...')
      await sandbox.commands.run('rm -f /home/user/project.zip', {
        timeoutMs: 5000,
      })

      // Return the zip file as a download
      console.log('[Download API] Sending zip file response...')
      return new Response(binaryData, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${project.title || 'project'}-${id}.zip"`,
          'Content-Length': binaryData.length.toString(),
        },
      })
    } catch (error) {
      console.error('[Download API] Error creating project archive:', error)
      return new Response(JSON.stringify({ 
        error: 'Failed to create project archive',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  } catch (error) {
    console.error('[Download API] Error downloading project:', error)
    return new Response(JSON.stringify({ 
      error: 'Failed to download project',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}