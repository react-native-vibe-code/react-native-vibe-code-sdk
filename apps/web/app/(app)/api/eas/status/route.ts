import { NextRequest, NextResponse } from 'next/server'
import { connectSandbox } from '@/lib/sandbox-connect'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const { 
      sandboxId, 
      projectId,
      type = 'build', // 'build' or 'submit'
      platform, // Optional: filter by platform
      limit = 10 // Number of items to retrieve
    } = await request.json()

    if (!sandboxId || !projectId) {
      return NextResponse.json(
        { error: 'Sandbox ID and Project ID are required' },
        { status: 400 }
      )
    }

    // Connect to the sandbox
    const sbx = await connectSandbox(sandboxId)

    try {
      // Navigate to the app directory
      await sbx.commands.run('cd /home/user/app')

      // Check if user is logged in to EAS
      const whoamiResult = await sbx.commands.run('eas whoami')
      if (whoamiResult.exitCode !== 0) {
        return NextResponse.json({
          success: false,
          error: 'Not logged in to EAS. Please login first.',
        }, { status: 401 })
      }

      let statusCommand: string
      
      if (type === 'build') {
        statusCommand = `cd /home/user/app && eas build:list --limit=${limit} --non-interactive`
        if (platform) {
          statusCommand += ` --platform=${platform}`
        }
      } else if (type === 'submit') {
        statusCommand = `cd /home/user/app && eas submit:list --limit=${limit} --non-interactive`
        if (platform) {
          statusCommand += ` --platform=${platform}`
        }
      } else {
        return NextResponse.json({
          error: 'Type must be either "build" or "submit"',
        }, { status: 400 })
      }

      console.log(`Getting ${type} status...`)
      const statusResult = await sbx.commands.run(statusCommand, {
        onStdout: (data) => console.log('Status stdout:', data),
        onStderr: (data) => console.log('Status stderr:', data),
      })

      // Parse the output to extract build/submission information
      const output = statusResult.stdout
      const items: any[] = []
      
      // Simple parsing - you might want to enhance this based on actual output format
      const lines = output.split('\n')
      let currentItem: any = null
      
      for (const line of lines) {
        // Parse build IDs
        if (line.includes('Build ID:') || line.includes('Submission ID:')) {
          if (currentItem) items.push(currentItem)
          currentItem = { id: line.split(':')[1]?.trim() }
        }
        // Parse status
        else if (currentItem && line.includes('Status:')) {
          currentItem.status = line.split(':')[1]?.trim()
        }
        // Parse platform
        else if (currentItem && line.includes('Platform:')) {
          currentItem.platform = line.split(':')[1]?.trim()
        }
        // Parse created time
        else if (currentItem && line.includes('Created:')) {
          currentItem.created = line.split('Created:')[1]?.trim()
        }
        // Parse build URL
        else if (currentItem && line.includes('Build details:')) {
          currentItem.url = line.split('Build details:')[1]?.trim()
        }
      }
      
      if (currentItem) items.push(currentItem)

      return NextResponse.json({
        success: true,
        type,
        projectId,
        platform,
        username: whoamiResult.stdout.trim(),
        items,
        rawOutput: output,
      })

    } catch (error: any) {
      console.error('Status check error:', error)
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to get status',
        details: error,
      }, { status: 500 })
    }

  } catch (error: any) {
    console.error('Sandbox error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to connect to sandbox',
    }, { status: 500 })
  }
}