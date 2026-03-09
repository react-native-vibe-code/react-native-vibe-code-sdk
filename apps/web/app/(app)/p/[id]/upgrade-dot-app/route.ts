import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { connectSandbox } from '@/lib/sandbox-connect'
import { eq } from 'drizzle-orm'
import * as fs from 'fs'
import * as path from 'path'

export const maxDuration = 120

// Recursively get all files in a directory
function getAllFiles(dirPath: string, basePath: string = ''): { relativePath: string; content: string }[] {
  const files: { relativePath: string; content: string }[] = []

  const items = fs.readdirSync(dirPath)

  for (const item of items) {
    const fullPath = path.join(dirPath, item)
    const relativePath = basePath ? path.join(basePath, item) : item
    const stat = fs.statSync(fullPath)

    if (stat.isDirectory()) {
      files.push(...getAllFiles(fullPath, relativePath))
    } else {
      const content = fs.readFileSync(fullPath, 'utf-8')
      files.push({ relativePath, content })
    }
  }

  return files
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log('🔵 [Upgrade Remote Control] API called')

  const { id: projectId } = await params
  console.log('📋 [Upgrade Remote Control] Project ID:', projectId)

  if (!projectId) {
    return new Response(JSON.stringify({ error: 'Project ID is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Query database to get sandbox ID from project
  console.log('🔍 [Upgrade Remote Control] Looking up project in database:', projectId)
  let sandboxId: string
  try {
    const project = await db
      .select({ sandboxId: projects.sandboxId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    if (!project.length || !project[0].sandboxId) {
      console.log('❌ [Upgrade Remote Control] Project not found or no sandbox ID')
      return new Response(
        JSON.stringify({
          error: 'Project not found or no active sandbox',
          details: 'The project may not exist or may not have an active sandbox',
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      )
    }

    sandboxId = project[0].sandboxId
    console.log('✅ [Upgrade Remote Control] Found sandbox ID:', sandboxId)
  } catch (dbError) {
    console.error('💥 [Upgrade Remote Control] Database query error:', dbError)
    return new Response(
      JSON.stringify({
        error: 'Failed to query project database',
        details: dbError instanceof Error ? dbError.message : String(dbError),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  try {
    // Connect to existing sandbox
    console.log('🔌 [Upgrade Remote Control] Connecting to sandbox:', sandboxId)
    let sbx
    try {
      sbx = await connectSandbox(sandboxId)
      console.log('✅ [Upgrade Remote Control] Successfully connected to sandbox')
    } catch (sandboxError: any) {
      console.log('❌ [Upgrade Remote Control] Failed to connect to sandbox:', sandboxError)
      if (sandboxError.message?.includes('not found') || sandboxError.status === 404) {
        return new Response(
          JSON.stringify({
            error: 'Sandbox not found or expired',
            details: 'The sandbox may have been destroyed or the ID is invalid',
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        )
      }
      throw sandboxError
    }

    // Read all files from local floating-chat folder
    const localFloatingChatPath = path.join(process.cwd(), 'local-expo-app', 'features', 'floating-chat')
    console.log('📂 [Upgrade Remote Control] Reading local files from:', localFloatingChatPath)

    if (!fs.existsSync(localFloatingChatPath)) {
      return new Response(
        JSON.stringify({
          error: 'Local floating-chat folder not found',
          details: `Expected folder at: ${localFloatingChatPath}`,
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const files = getAllFiles(localFloatingChatPath)
    console.log(`📦 [Upgrade Remote Control] Found ${files.length} files to sync`)

    // Delete existing floating-chat folder in sandbox
    console.log('🗑️ [Upgrade Remote Control] Deleting existing floating-chat folder in sandbox')
    try {
      await sbx.commands.run('rm -rf /home/user/app/features/floating-chat', { timeoutMs: 30000 })
      console.log('✅ [Upgrade Remote Control] Existing folder deleted')
    } catch (deleteError) {
      console.log('⚠️ [Upgrade Remote Control] Delete warning (may not exist):', deleteError)
    }

    // Create necessary directories
    console.log('📁 [Upgrade Remote Control] Creating directory structure')
    const dirs = new Set<string>()
    for (const file of files) {
      const dir = path.dirname(file.relativePath)
      if (dir && dir !== '.') {
        dirs.add(dir)
      }
    }

    // Sort dirs to create parent dirs first
    const sortedDirs = Array.from(dirs).sort((a, b) => a.split('/').length - b.split('/').length)
    for (const dir of sortedDirs) {
      const fullDir = `/home/user/app/features/floating-chat/${dir}`
      await sbx.commands.run(`mkdir -p ${fullDir}`, { timeoutMs: 10000 })
    }

    // Also create the base directory
    await sbx.commands.run('mkdir -p /home/user/app/features/floating-chat', { timeoutMs: 10000 })

    // Write each file to sandbox
    const syncedFiles: string[] = []
    const errors: string[] = []

    for (const file of files) {
      const sandboxPath = `/home/user/app/features/floating-chat/${file.relativePath}`
      console.log(`📝 [Upgrade Remote Control] Writing: ${file.relativePath}`)

      try {
        await sbx.files.write(sandboxPath, file.content)
        syncedFiles.push(file.relativePath)
      } catch (writeError: any) {
        console.error(`❌ [Upgrade Remote Control] Failed to write ${file.relativePath}:`, writeError)
        errors.push(`${file.relativePath}: ${writeError.message || String(writeError)}`)
      }
    }

    console.log(`✅ [Upgrade Remote Control] Synced ${syncedFiles.length}/${files.length} files`)

    const result = {
      success: errors.length === 0,
      message: `Synced ${syncedFiles.length} files to sandbox`,
      syncedFiles,
      errors: errors.length > 0 ? errors : undefined,
      sandboxId,
      projectId,
    }

    return new Response(JSON.stringify(result, null, 2), {
      status: errors.length === 0 ? 200 : 207,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('💥 [Upgrade Remote Control] Unexpected error:', error)
    return new Response(
      JSON.stringify({
        error: 'Failed to sync floating-chat to sandbox',
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
