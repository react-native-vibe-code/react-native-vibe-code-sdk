import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { eq } from 'drizzle-orm'
import { globalFileWatcher } from '@/lib/sandbox-file-watcher'
import { globalFileChangeStream } from '@/lib/file-change-stream'
import { connectSandbox } from '@/lib/sandbox-connect'

export const maxDuration = 120

export async function POST(req: Request) {
  // console.log('🔵 [Sandbox Structure] API called')

  let reqData: any = {}
  try {
    const body = await req.text()
    // console.log('📝 [Sandbox Structure] Raw request body:', body)

    if (body.trim()) {
      reqData = JSON.parse(body)
      // console.log('📦 [Sandbox Structure] Parsed request data:', reqData)
    }
  } catch (error) {
    // console.log('❌ [Sandbox Structure] Failed to parse request body:', error)
  }

  const { projectId, action, filePath } = reqData
  // // console.log('🎯 [Sandbox Structure] Extracted params:', {
  //   projectId,
  //   action,
  //   filePath,
  // })

  if (!projectId) {
    // console.log('❌ [Sandbox Structure] Missing project ID')
    return new Response(JSON.stringify({ error: 'Project ID is required' }), {
      status: 400,
    })
  }

  // Query database to get sandbox ID from project
  // console.log(
    // '🔍 [Sandbox Structure] Looking up project in database:',
  //   projectId,
  // )
  let sandboxId: string
  try {
    const project = await db
      .select({ sandboxId: projects.sandboxId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    if (!project.length || !project[0].sandboxId) {
      // console.log('❌ [Sandbox Structure] Project not found or no sandbox ID')
      return new Response(
        JSON.stringify({
          error: 'Project not found or no active sandbox',
          details:
            'The project may not exist or may not have an active sandbox',
        }),
        { status: 404 },
      )
    }

    sandboxId = project[0].sandboxId
    // console.log('✅ [Sandbox Structure] Found sandbox ID:', sandboxId)
  } catch (dbError) {
    // console.error('💥 [Sandbox Structure] Database query error:', dbError)
    return new Response(
      JSON.stringify({
        error: 'Failed to query project database',
        details: dbError instanceof Error ? dbError.message : String(dbError),
      }),
      { status: 500 },
    )
  }

  try {
    // console.log(
      // '🔌 [Sandbox Structure] Attempting to connect to sandbox:',
    //   sandboxId,
    // )

    // Connect to existing sandbox
    let sbx
    try {
      sbx = await connectSandbox(sandboxId)
      // console.log('✅ [Sandbox Structure] Successfully connected to sandbox')

      // File watcher is now handled by dedicated /api/file-watch endpoint
      // console.log(`ℹ️ [Sandbox Structure] File watching handled by dedicated endpoint`)
    } catch (sandboxError: any) {
      // console.log(
        // '❌ [Sandbox Structure] Failed to connect to sandbox:',
        // sandboxError,
      // )

      if (
        sandboxError.message?.includes('not found') ||
        sandboxError.status === 404
      ) {
        // console.log('📋 [Sandbox Structure] Sandbox not found, returning 404')
        return new Response(
          JSON.stringify({
            error: 'Sandbox not found or expired',
            details: 'The sandbox may have been destroyed or the ID is invalid',
          }),
          { status: 404 },
        )
      }
      throw sandboxError
    }

    if (action === 'structure') {
      // console.log('📁 [Sandbox Structure] Getting file structure...')

      // Get the file structure using basic filesystem commands
      // console.log(
        // '📁 [Sandbox Structure] Using simple find command to get file list...',
      // )
      const structureResult = await sbx.commands.run(
        `cd /home/user/app && find . -type f \\( -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.md" \\) | grep -v node_modules | grep -v "features/element-edition" | grep -v "features/floating-chat" | grep -v "contexts/AuthContext.tsx" | head -20 | sort | sed 's|^./||'`,
        { timeoutMs: 5 * 60 * 1000 },
      )

      // console.log('📊 [Sandbox Structure] Command result:', {
      //   exitCode: structureResult.exitCode,
      //   stdout: structureResult.stdout?.substring(0, 200) + '...',
      //   stderr: structureResult.stderr,
      // })

      if (structureResult.exitCode !== 0) {
        // console.log(
          // '❌ [Sandbox Structure] Structure command failed with exit code:',
          // structureResult.exitCode,
        // )
        // console.log(
          // '❌ [Sandbox Structure] Error output:',
          // structureResult.stderr,
        // )
        throw new Error(`Structure command failed: ${structureResult.stderr}`)
      }

      // Convert file list to JSON structure
      const fileList = structureResult.stdout
        .split('\n')
        .filter((line) => line.trim() !== '')

      const structure = fileList.map((filePath) => {
        const fileName = filePath.split('/').pop() || filePath
        const extension = fileName.includes('.')
          ? fileName.split('.').pop()
          : 'file'

        return {
          name: fileName,
          type: extension,
          path: filePath,
          size: '1kb',
        }
      })

      console.log(
        // '✅ [Sandbox Structure] Successfully created structure, items count:',
        structure.length,
      )
      // console.log('📋 [Sandbox Structure] Files found:', structure.slice(0, 3))

      // console.log('📤 [Sandbox Structure] Returning structure response')
      return new Response(JSON.stringify({ structure }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } else if (action === 'file') {
      // console.log('📄 [Sandbox Structure] Getting file content for:', filePath)

      if (!filePath) {
        // console.log('❌ [Sandbox Structure] Missing file path')
        return new Response(
          JSON.stringify({ error: 'File path is required for file action' }),
          { status: 400 },
        )
      }

      // Get file content
      const fullPath = `/home/user/app/${filePath}`
      // console.log('📂 [Sandbox Structure] Full file path:', fullPath)

      // Get file content using basic cat command
      // console.log('📄 [Sandbox Structure] Reading file with cat...')
      const fileResult = await sbx.commands.run(
        `cat "${fullPath}" 2>/dev/null || echo "FILE_NOT_FOUND"`,
        { timeoutMs: 5 * 60 * 1000 },
      )

      // console.log('📊 [Sandbox Structure] File command result:', {
      //   exitCode: fileResult.exitCode,
      //   stdout: fileResult.stdout?.substring(0, 200) + '...',
      //   stderr: fileResult.stderr,
      // })

      if (fileResult.exitCode !== 0) {
        // console.log(
          // '❌ [Sandbox Structure] File read failed with exit code:',
          // fileResult.exitCode,
        // )
        // console.log('❌ [Sandbox Structure] Error output:', fileResult.stderr)
        throw new Error(`File read failed: ${fileResult.stderr}`)
      }

      // Handle raw file content from cat command
      const content = fileResult.stdout || ''
      if (content === 'FILE_NOT_FOUND') {
        // console.log('❌ [Sandbox Structure] File not found:', fullPath)
        return new Response(JSON.stringify({ error: 'File not found' }), {
          status: 404,
        })
      }

      const fileData = {
        content: content,
        path: filePath,
      }
      // console.log(
        // '✅ [Sandbox Structure] Successfully read file, content length:',
        // content.length,
      // )

      // console.log('📤 [Sandbox Structure] Returning file content response')
      return new Response(JSON.stringify(fileData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } else if (action === 'bulk-files') {
      // console.log('🚀 [Sandbox Structure] ===== BULK FILES ACTION TRIGGERED =====')
      // console.log('📦 [Sandbox Structure] Getting bulk file contents for project:', projectId)

      // First get the file structure - simplified find command
      // console.log('🔍 [Sandbox Structure] Running find command to get all files...')
      const findCommand = `find /home/user/app -type f -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" -o -name "*.py" -o -name "*.json" -o -name "*.md" -o -name "*.txt" -o -name "*.html" -o -name "*.css" | grep -v node_modules | grep -v ".git/" | grep -v "features/element-edition" | grep -v "features/floating-chat" | grep -v "contexts/AuthContext.tsx" | head -100`
      // console.log('📋 [Sandbox Structure] Find command:', findCommand)
      
      const structureResult = await sbx.commands.run(findCommand, { timeoutMs: 30 * 1000 })
      
      // console.log('📊 [Sandbox Structure] Find command result:')
      console.log('  Exit code:', structureResult.exitCode)
      console.log('  Stdout length:', structureResult.stdout?.length || 0)
      console.log('  Stderr:', structureResult.stderr)

      if (structureResult.exitCode !== 0) {
        // console.log('❌ [Sandbox Structure] Failed to get file list:', structureResult.stderr)
        throw new Error(`Failed to get file list: ${structureResult.stderr}`)
      }

      const filePaths = structureResult.stdout
        .split('\n')
        .filter(path => path.trim())
        .map(path => path.replace('/home/user/app/', ''))
        .filter(path => path.length > 0)

      // console.log(`📁 [Sandbox Structure] Found ${filePaths.length} files to cache`)
      // console.log('📄 [Sandbox Structure] All files found:')
      // filePaths.forEach((path, index) => {
        // console.log(`  ${index + 1}. ${path}`)
      // })
      
      if (filePaths.length === 0) {
        // console.log('⚠️ [Sandbox Structure] No files found! This might be an issue.')
        return new Response(JSON.stringify({ files: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Read all files in parallel (in batches to avoid overwhelming the system)
      const batchSize = 10
      const files: Array<{ path: string; content: string; size: number; lastModified: number }> = []
      
      // console.log(`🔄 [Sandbox Structure] Starting to read ${filePaths.length} files in batches of ${batchSize}...`)
      
      for (let i = 0; i < filePaths.length; i += batchSize) {
        const batch = filePaths.slice(i, i + batchSize)
        // console.log(`📦 [Sandbox Structure] Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(filePaths.length/batchSize)} with ${batch.length} files`)
        
        const batchPromises = batch.map(async (filePath) => {
          const fullPath = `/home/user/app/${filePath}`
          
          try {
            // console.log(`📄 [Sandbox Structure] Reading file: ${fullPath}`)
            
            // Try to read file content
            const contentResult = await sbx.commands.run(`cat "${fullPath}"`, { timeoutMs: 10 * 1000 })
            
            // console.log(`📄 [Sandbox Structure] File ${filePath} - exit code: ${contentResult.exitCode}, content length: ${contentResult.stdout?.length || 0}`)
            
            if (contentResult.exitCode === 0 && contentResult.stdout !== undefined) {
              // Get file stats
              const statsResult = await sbx.commands.run(`stat -c "%s" "${fullPath}"`, { timeoutMs: 5 * 1000 })
              const size = statsResult.exitCode === 0 ? parseInt(statsResult.stdout.trim()) : contentResult.stdout.length
              
              // console.log(`✅ [Sandbox Structure] Successfully read ${filePath}, size: ${size} bytes`)
              
              return {
                path: filePath,
                content: contentResult.stdout,
                size: size,
                lastModified: Date.now() // Use current time since stat might not work
              }
            } else {
              // console.log(`⚠️ [Sandbox Structure] Failed to read ${filePath} - exit code: ${contentResult.exitCode}, stderr: ${contentResult.stderr}`)
            }
          } catch (error) {
            // console.log(`💥 [Sandbox Structure] Exception reading file ${filePath}:`, error)
          }
          return null
        })

        // console.log(`⏳ [Sandbox Structure] Waiting for batch ${Math.floor(i/batchSize) + 1} to complete...`)
        const batchResults = await Promise.all(batchPromises)
        const validFiles = batchResults.filter(file => file !== null)
        files.push(...validFiles)
        // console.log(`✅ [Sandbox Structure] Batch ${Math.floor(i/batchSize) + 1} completed, got ${validFiles.length} valid files`)
      }

      // console.log(`🎉 [Sandbox Structure] ===== BULK FILES COMPLETED =====`)
      // console.log(`📊 [Sandbox Structure] Final result: Successfully read ${files.length} out of ${filePaths.length} files`)
      
      if (files.length === 0) {
        // console.log('⚠️ [Sandbox Structure] No files were successfully read! This is a problem.')
      } else {
        // console.log('📄 [Sandbox Structure] Successfully read files:')
        // files.forEach((file, index) => {
          // console.log(`  ${index + 1}. ${file.path} (${file.size} bytes)`)
        // })
      }

      const response = { files }
      // console.log('📤 [Sandbox Structure] Returning bulk files response with', files.length, 'files')
      
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } else {
      // console.log('❌ [Sandbox Structure] Invalid action provided:', action)
      return new Response(
        JSON.stringify({ error: 'Invalid action. Use "structure", "file", or "bulk-files"' }),
        { status: 400 },
      )
    }
  } catch (error) {
    // console.error('💥 [Sandbox Structure] Unexpected error:', error)
    // console.error(
      // '💥 [Sandbox Structure] Error stack:',
      // error instanceof Error ? error.stack : 'No stack trace',
    // )

    return new Response(
      JSON.stringify({
        error: 'Failed to execute command in sandbox',
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500 },
    )
  }
}
