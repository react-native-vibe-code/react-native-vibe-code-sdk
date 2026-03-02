import { NextRequest, NextResponse } from 'next/server'
import { connectSandbox } from '@/lib/sandbox-connect'

export const maxDuration = 300 // 5 minutes for build process

export async function POST(request: NextRequest) {
  try {
    const { 
      sandboxId, 
      projectId, 
      platform = 'all', // 'ios', 'android', or 'all'
      profile = 'preview' // 'development', 'preview', or 'production'
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

      // Initialize EAS project if not already done
      console.log('Checking EAS project configuration...')
      const checkConfig = await sbx.commands.run('cd /home/user/app && [ -f eas.json ] && echo "exists" || echo "not exists"')
      
      if (!checkConfig.stdout.includes('exists')) {
        console.log('Configuring EAS project...')
        const configCmd = platform === 'all' 
          ? 'eas build:configure --non-interactive'
          : `eas build:configure -p ${platform} --non-interactive`
        
        const configResult = await sbx.commands.run(`cd /home/user/app && ${configCmd}`, {
          onStdout: (data) => console.log('Config stdout:', data),
          onStderr: (data) => console.log('Config stderr:', data),
        })

        if (configResult.exitCode !== 0) {
          return NextResponse.json({
            success: false,
            error: 'Failed to configure EAS project',
            details: configResult.stderr,
          }, { status: 500 })
        }
      }

      // Start the build process
      console.log(`Starting ${platform} build with profile: ${profile}...`)
      
      let buildCommand = 'cd /home/user/app && eas build'
      
      // Add platform flag
      if (platform !== 'all') {
        buildCommand += ` -p ${platform}`
      }
      
      // Add profile
      buildCommand += ` --profile ${profile}`
      
      // Add non-interactive and no-wait flags
      buildCommand += ' --non-interactive --no-wait --clear-cache'
      
      const buildResult = await sbx.commands.run(buildCommand, {
        onStdout: (data) => console.log('Build stdout:', data),
        onStderr: (data) => console.log('Build stderr:', data),
      })

      // Parse build URLs from output
      const buildUrls: Record<string, string | null> = {}
      
      // Look for iOS build URL
      const iosBuildMatch = buildResult.stdout.match(/iOS build details: (https:\/\/expo\.dev\/[^\s]+)/)
      if (iosBuildMatch) {
        buildUrls.ios = iosBuildMatch[1]
      }
      
      // Look for Android build URL
      const androidBuildMatch = buildResult.stdout.match(/Android build details: (https:\/\/expo\.dev\/[^\s]+)/)
      if (androidBuildMatch) {
        buildUrls.android = androidBuildMatch[1]
      }
      
      // Generic build URL pattern
      const genericBuildMatch = buildResult.stdout.match(/Build details: (https:\/\/expo\.dev\/[^\s]+)/)
      if (genericBuildMatch && !buildUrls.ios && !buildUrls.android) {
        buildUrls[platform] = genericBuildMatch[1]
      }

      // Check build status
      const listBuilds = await sbx.commands.run('cd /home/user/app && eas build:list --limit=1 --non-interactive')

      return NextResponse.json({
        success: true,
        message: `Build initiated successfully for ${platform}`,
        projectId,
        platform,
        profile,
        buildUrls,
        username: whoamiResult.stdout.trim(),
        output: buildResult.stdout,
        recentBuilds: listBuilds.stdout,
      })

    } catch (error: any) {
      console.error('Build error:', error)
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to initiate build',
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