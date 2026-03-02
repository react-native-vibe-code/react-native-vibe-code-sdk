import { NextRequest, NextResponse } from 'next/server'
import { connectSandbox } from '@/lib/sandbox-connect'

export const maxDuration = 300 // 5 minutes for submit process

export async function POST(request: NextRequest) {
  try {
    const { 
      sandboxId, 
      projectId,
      platform, // 'ios' or 'android'
      buildId, // Optional: specific build ID to submit
      latest = true, // Use latest build if buildId not provided
      profile = 'production' // Submit profile
    } = await request.json()

    if (!sandboxId || !projectId || !platform) {
      return NextResponse.json(
        { error: 'Sandbox ID, Project ID, and platform are required' },
        { status: 400 }
      )
    }

    if (platform !== 'ios' && platform !== 'android') {
      return NextResponse.json(
        { error: 'Platform must be either "ios" or "android"' },
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

      // Build the submit command
      let submitCommand = `cd /home/user/app && eas submit -p ${platform}`
      
      if (buildId) {
        // Submit specific build
        submitCommand += ` --id ${buildId}`
      } else if (latest) {
        // Submit latest build
        submitCommand += ' --latest'
      }
      
      // Add non-interactive flag
      submitCommand += ' --non-interactive'
      
      console.log(`Submitting ${platform} build to store...`)
      console.log(`Command: ${submitCommand}`)
      
      const submitResult = await sbx.commands.run(submitCommand, {
        onStdout: (data) => console.log('Submit stdout:', data),
        onStderr: (data) => console.log('Submit stderr:', data),
      })

      // Parse submission URL from output
      let submissionUrl: string | null = null
      
      if (platform === 'ios') {
        // Look for App Store Connect URL
        const appStoreMatch = submitResult.stdout.match(/App Store Connect: (https:\/\/[^\s]+)/)
        if (appStoreMatch) {
          submissionUrl = appStoreMatch[1]
        }
      } else {
        // Look for Google Play Console URL
        const playStoreMatch = submitResult.stdout.match(/Google Play Console: (https:\/\/[^\s]+)/)
        if (playStoreMatch) {
          submissionUrl = playStoreMatch[1]
        }
      }
      
      // Generic submission URL pattern
      const genericSubmissionMatch = submitResult.stdout.match(/Submission details: (https:\/\/expo\.dev\/[^\s]+)/)
      if (genericSubmissionMatch && !submissionUrl) {
        submissionUrl = genericSubmissionMatch[1]
      }

      // Get submission status
      const listSubmissions = await sbx.commands.run(`cd /home/user/app && eas submit:list --platform=${platform} --limit=1 --non-interactive`)

      const success = submitResult.exitCode === 0

      return NextResponse.json({
        success,
        message: success 
          ? `Successfully submitted ${platform} build to ${platform === 'ios' ? 'App Store Connect' : 'Google Play Console'}`
          : `Failed to submit ${platform} build`,
        projectId,
        platform,
        buildId: buildId || 'latest',
        submissionUrl,
        username: whoamiResult.stdout.trim(),
        output: submitResult.stdout,
        error: success ? undefined : submitResult.stderr,
        recentSubmissions: listSubmissions.stdout,
      })

    } catch (error: any) {
      console.error('Submit error:', error)
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to submit build to store',
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