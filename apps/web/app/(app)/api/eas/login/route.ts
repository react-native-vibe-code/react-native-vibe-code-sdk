import { NextRequest, NextResponse } from 'next/server'
import { connectSandbox } from '@/lib/sandbox-connect'

export const maxDuration = 60 // Max duration for Vercel functions

export async function POST(request: NextRequest) {
  try {
    const { sandboxId } = await request.json()

    if (!sandboxId) {
      return NextResponse.json(
        { error: 'Sandbox ID is required' },
        { status: 400 }
      )
    }

    // Connect to the sandbox
    const sbx = await connectSandbox(sandboxId)

    try {
      // First check if already logged in
      const checkLogin = await sbx.commands.run('eas whoami')
      
      if (checkLogin.exitCode === 0 && checkLogin.stdout.trim()) {
        // Already logged in
        return NextResponse.json({
          success: true,
          message: 'Already logged in to EAS',
          username: checkLogin.stdout.trim(),
        })
      }
      
      // Run the EAS login script
      console.log('Running EAS login script...')
      const loginResult = await sbx.commands.run('cd /claude-sdk && node eas-login.js', {
        onStdout: (data) => console.log('Login stdout:', data),
        onStderr: (data) => console.log('Login stderr:', data),
      })
      
      // Check if the login was successful
      if (loginResult.exitCode === 0 || loginResult.stdout.includes('Login successful')) {
        // Verify by running whoami command
        const whoamiResult = await sbx.commands.run('eas whoami')
        
        return NextResponse.json({
          success: true,
          message: 'EAS login successful',
          username: whoamiResult.stdout.trim(),
          output: loginResult.stdout,
        })
      } else {
        // If the script fails, try a direct approach with credentials
        console.log('Script approach failed, trying direct login...')
        
        // Set environment variables for non-interactive login (if EAS supports it)
        await sbx.commands.run(`export EXPO_TOKEN=${process.env.EXPO_TOKEN || ''}`)
        
        return NextResponse.json({
          success: false,
          error: 'EAS login failed - manual intervention may be required',
          output: loginResult.stdout,
          stderr: loginResult.stderr,
          note: 'You may need to manually configure EAS credentials in the sandbox',
        })
      }

    } catch (error: any) {
      console.error('EAS login error:', error)
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to login to EAS',
        details: error,
      }, { status: 500 })
    } finally {
      // Don't close the sandbox as we'll need it for subsequent operations
      console.log('EAS login process completed')
    }

  } catch (error: any) {
    console.error('Sandbox error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to connect to sandbox',
    }, { status: 500 })
  }
}