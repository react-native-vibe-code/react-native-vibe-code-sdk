import type { ISandbox as Sandbox } from '@react-native-vibe-code/sandbox/lib'

/**
 * Execute git status in sandbox
 */
export async function getGitStatus(sandbox: Sandbox): Promise<string> {
  try {
    const result = await sandbox.commands.run(
      'cd /home/user/app && git status --porcelain',
      { timeoutMs: 10000 }
    )
    return result.stdout || ''
  } catch (error) {
    console.error('[Git Operations] Error getting git status:', error)
    return ''
  }
}

/**
 * Check if directory is a git repository
 */
export async function isGitRepository(sandbox: Sandbox): Promise<boolean> {
  try {
    const result = await sandbox.commands.run('cd /home/user/app && git status', {
      timeoutMs: 5000,
    })
    return result.exitCode === 0
  } catch (error) {
    return false
  }
}

/**
 * Get current branch name
 */
export async function getCurrentBranch(sandbox: Sandbox): Promise<string | null> {
  try {
    const result = await sandbox.commands.run(
      'cd /home/user/app && git branch --show-current',
      { timeoutMs: 5000 }
    )
    if (result.exitCode === 0 && result.stdout.trim()) {
      return result.stdout.trim()
    }
    return null
  } catch (error) {
    console.error('[Git Operations] Error getting current branch:', error)
    return null
  }
}

/**
 * Get current commit hash
 */
export async function getCurrentCommitHash(sandbox: Sandbox): Promise<string | null> {
  try {
    const result = await sandbox.commands.run(
      'cd /home/user/app && git rev-parse HEAD',
      { timeoutMs: 5000 }
    )
    if (result.exitCode === 0 && result.stdout.trim()) {
      return result.stdout.trim()
    }
    return null
  } catch (error) {
    console.error('[Git Operations] Error getting current commit:', error)
    return null
  }
}

/**
 * Get short commit hash
 */
export async function getShortCommitHash(sandbox: Sandbox): Promise<string | null> {
  try {
    const result = await sandbox.commands.run(
      'cd /home/user/app && git rev-parse --short HEAD',
      { timeoutMs: 5000 }
    )
    if (result.exitCode === 0 && result.stdout.trim()) {
      return result.stdout.trim()
    }
    return null
  } catch (error) {
    console.error('[Git Operations] Error getting short commit hash:', error)
    return null
  }
}

/**
 * Clear Metro/Expo cache in sandbox
 */
export async function clearCache(sandbox: Sandbox): Promise<boolean> {
  try {
    const script = `#!/bin/bash
cd /home/user/app

echo "Clearing all caches..."
rm -rf node_modules/.cache 2>/dev/null || true
rm -rf .expo 2>/dev/null || true
rm -rf /tmp/metro-* 2>/dev/null || true
rm -rf /tmp/react-* 2>/dev/null || true
npm cache clean --force 2>/dev/null || true
sync

echo "Cache clearing completed"
`

    const result = await sandbox.commands.run(script, { timeoutMs: 15000 })
    return result.exitCode === 0
  } catch (error) {
    console.error('[Git Operations] Error clearing cache:', error)
    return false
  }
}

/**
 * Kill server processes in sandbox
 */
export async function killServerProcesses(sandbox: Sandbox): Promise<boolean> {
  try {
    const script = `#!/bin/bash
cd /home/user/app

echo "Killing existing processes..."
pkill -f "expo start" || true
pkill -f "metro" || true
pkill -f "react-native start" || true
pkill -f "bun run start" || true
pkill -f "npm start" || true
pkill -f "yarn start" || true

sleep 2
echo "Process cleanup completed"
`

    const result = await sandbox.commands.run(script, { timeoutMs: 10000 })
    return result.exitCode === 0
  } catch (error) {
    console.error('[Git Operations] Error killing server processes:', error)
    return false
  }
}

/**
 * Touch source files to trigger rebuilds
 */
export async function touchSourceFiles(sandbox: Sandbox): Promise<boolean> {
  try {
    const script = `#!/bin/bash
cd /home/user/app

echo "Touching source files to trigger rebuilds..."
find . -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" -o -name "*.json" | grep -v node_modules | xargs touch 2>/dev/null || true
sync

echo "Source files refreshed"
`

    const result = await sandbox.commands.run(script, { timeoutMs: 10000 })
    return result.exitCode === 0
  } catch (error) {
    console.error('[Git Operations] Error touching source files:', error)
    return false
  }
}
