import type { ISandbox } from './providers/types'

export interface GitHubConfig {
  owner: string
  token: string
}

export class GitHubService {
  private config: GitHubConfig

  constructor(config: GitHubConfig) {
    this.config = config
  }

  /**
   * Initialize git repository and push initial code to GitHub
   */
  async initializeRepository(
    sandbox: ISandbox,
    projectId: string,
    repositoryName: string,
    commitMessage: string = 'Initial commit'
  ): Promise<boolean> {
    try {
      const gitSetupScript = `#!/bin/bash
set -e

cd /home/user/app

# Check if we're already in a git repository
if [ ! -d ".git" ]; then
  echo "Initializing git repository..."
  git init
  git remote add origin https://${this.config.token}@github.com/${this.config.owner}/${repositoryName}.git
else
  echo "Git repository already exists"
fi

# Configure git user
git config user.name "E2B Sandbox"
git config user.email "sandbox@e2b.dev"

# Add all files
git add .

# Check if there are any changes to commit
if git diff --staged --quiet; then
  echo "No changes to commit"
else
  # Commit changes
  git commit -m "${commitMessage}"

  # Push to GitHub
  echo "Pushing to GitHub..."
  # Always use main branch
  git branch -M main
  git push -u origin main --force

  echo "Successfully pushed to GitHub"
fi
`

      const execution = await sandbox.commands.run(gitSetupScript, {
        timeoutMs: 60000, // 1 minute timeout
      })

      if (execution.exitCode !== 0) {
        console.error(`[GitHub Service] Git setup failed:`, execution.stderr)
        return false
      }

      return true
    } catch (error) {
      console.error(`[GitHub Service] Error initializing repository:`, error)
      return false
    }
  }

  /**
   * Commit and push changes to GitHub
   */
  async commitAndPush(
    sandbox: ISandbox,
    repositoryName: string,
    commitMessage: string,
    files?: string[]
  ): Promise<boolean> {
    try {
      const filesToAdd = files && files.length > 0 ? files.join(' ') : '.'

      const gitCommitScript = `#!/bin/bash
set -e

cd /home/user/app

# Configure git user (in case it's not set)
git config user.name "E2B Sandbox"
git config user.email "sandbox@e2b.dev"

# Add specified files or all files
git add ${filesToAdd}

# Check if there are any changes to commit
if git diff --staged --quiet; then
  echo "No changes to commit"
  exit 0
fi

# Commit changes
git commit -m "${commitMessage}"

# Push to GitHub
echo "Pushing changes to GitHub..."
# Always push to main branch
git push origin main

echo "Successfully pushed changes to GitHub"
`

      const execution = await sandbox.commands.run(gitCommitScript, {
        timeoutMs: 60000, // 1 minute timeout
      })

      if (execution.exitCode !== 0) {
        console.error(`[GitHub Service] Git commit/push failed:`, execution.stderr)
        return false
      }

      return true
    } catch (error) {
      console.error(`[GitHub Service] Error committing and pushing:`, error)
      return false
    }
  }

  /**
   * Pull latest changes from GitHub
   */
  async pullChanges(
    sandbox: ISandbox,
    repositoryName: string
  ): Promise<boolean> {
    try {
      const gitPullScript = `#!/bin/bash
set -e

cd /home/user/app

# Pull latest changes
git pull origin main || git pull origin master || {
  echo "No remote changes to pull"
}

echo "Successfully pulled latest changes"
`

      const execution = await sandbox.commands.run(gitPullScript, {
        timeoutMs: 30000, // 30 seconds timeout
      })

      if (execution.exitCode !== 0) {
        console.error(`[GitHub Service] Git pull failed:`, execution.stderr)
        return false
      }

      return true
    } catch (error) {
      console.error(`[GitHub Service] Error pulling changes:`, error)
      return false
    }
  }

  /**
   * Get git status
   */
  async getStatus(sandbox: ISandbox): Promise<string> {
    try {
      const execution = await sandbox.commands.run('cd /home/user/app && git status --porcelain', {
        timeoutMs: 10000,
      })

      return execution.stdout || ''
    } catch (error) {
      console.error(`[GitHub Service] Error getting git status:`, error)
      return ''
    }
  }

  /**
   * Check if directory is a git repository
   */
  async isGitRepository(sandbox: ISandbox): Promise<boolean> {
    try {
      const execution = await sandbox.commands.run('cd /home/user/app && git status', {
        timeoutMs: 5000,
      })

      return execution.exitCode === 0
    } catch (error) {
      return false
    }
  }

  /**
   * Create a zip archive of the project
   */
  async createProjectArchive(sandbox: ISandbox): Promise<Buffer | null> {
    try {
      const zipScript = `#!/bin/bash
set -e

cd /home/user

# Install zip if not available
if ! command -v zip &> /dev/null; then
  echo "Installing zip utility..." >&2
  apt-get update >&2 && apt-get install -y zip >&2
fi

# Create a temporary zip file
# Exclude node_modules, .git, and other unnecessary files
zip -r project.zip app \\
  -x "app/node_modules/*" \\
  -x "app/.git/*" \\
  -x "app/.next/*" \\
  -x "app/build/*" \\
  -x "app/dist/*" \\
  -x "app/.cache/*" \\
  -x "app/.env.local" \\
  -x "app/.DS_Store" \\
  -x "app/Thumbs.db" \\
  -x "*/.__pycache__/*" \\
  -x "*/.pytest_cache/*" \\
  -x "app/android/.gradle/*" \\
  -x "app/android/build/*" \\
  -x "app/ios/build/*" \\
  -x "app/ios/Pods/*" >&2

# Output the zip file as base64 without line breaks for proper decoding
base64 -w 0 /home/user/project.zip
`

      const execution = await sandbox.commands.run(zipScript, {
        timeoutMs: 60000, // 1 minute timeout
      })

      if (execution.exitCode !== 0) {
        console.error(`[GitHub Service] Failed to create archive:`, execution.stderr)
        return null
      }

      // Convert base64 back to binary
      const base64Data = execution.stdout.trim()
      const binaryData = Buffer.from(base64Data, 'base64')

      // Clean up the zip file from sandbox
      await sandbox.commands.run('rm -f /home/user/project.zip', {
        timeoutMs: 5000,
      })

      return binaryData
    } catch (error) {
      console.error(`[GitHub Service] Error creating project archive:`, error)
      return null
    }
  }
}
