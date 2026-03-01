import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { Sandbox } from '@e2b/code-interpreter'
import { Octokit } from '@octokit/rest'
import { GitHubService } from '@/lib/github-service'
import { eq } from 'drizzle-orm'
import { generateTitleFromUserMessage } from '@/lib/name-generator'
import type { UIMessage } from 'ai'

export const maxDuration = 300 // 5 minutes

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
})

const githubService = new GitHubService({
  owner: process.env.GITHUB_OWNER || 'react-native-vibe-code',
  token: process.env.GITHUB_TOKEN!,
})

// E2B template IDs
const TEMPLATE_ID = 'sm3r39vktkmu37lna0qa' // expo template

// Secret key for x-bot internal calls
const X_BOT_SECRET = process.env.X_BOT_SECRET

interface CreateProjectRequest {
  tweetId: string
  userId: string
  appDescription: string
  imageUrls: string[]
  secret: string
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateProjectRequest = await request.json()
    const { tweetId, userId, appDescription, imageUrls, secret } = body

    // Validate internal secret
    if (secret !== X_BOT_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate required fields
    if (!tweetId || !userId || !appDescription) {
      return NextResponse.json(
        { error: 'Missing required fields: tweetId, userId, appDescription' },
        { status: 400 }
      )
    }

    console.log(`[X-Bot Create Project] Creating project for tweet ${tweetId}`)

    // Generate project ID
    const projectId = crypto.randomUUID()

    // Generate app name from description
    let appName = 'my-app'
    try {
      const mockMessage: UIMessage = {
        id: tweetId,
        role: 'user',
        content: appDescription,
        createdAt: new Date(),
        parts: [{ type: 'text', text: appDescription }],
      }
      appName = await generateTitleFromUserMessage({ message: mockMessage })
      console.log(`[X-Bot Create Project] Generated app name: ${appName}`)
    } catch (error) {
      console.error('[X-Bot Create Project] Failed to generate app name:', error)
    }

    // Create E2B sandbox
    console.log('[X-Bot Create Project] Creating E2B sandbox...')
    const sandbox = await Sandbox.create(TEMPLATE_ID, {
      metadata: {
        template: TEMPLATE_ID,
        userID: userId,
        projectId,
        source: 'x-bot',
        tweetId,
      },
      timeoutMs: parseInt(process.env.E2B_SANDBOX_TIMEOUT_MS || '3600000'),
    })
    console.log(`[X-Bot Create Project] Created sandbox: ${sandbox.sandboxId}`)

    // Create project in database
    const repositoryName = `project-${projectId}`
    const newProject = await db
      .insert(projects)
      .values({
        id: projectId,
        title: appName,
        userId,
        sandboxId: sandbox.sandboxId,
        template: 'react-native-expo',
        status: 'active',
        isPublic: true, // X-bot projects are public by default
        githubRepo: repositoryName,
      })
      .returning()

    console.log(`[X-Bot Create Project] Created project: ${projectId}`)

    // Create GitHub repository
    const owner = process.env.GITHUB_OWNER || 'react-native-vibe-code'
    try {
      await octokit.repos.get({ owner, repo: repositoryName })
      console.log(`[X-Bot Create Project] GitHub repo already exists`)
    } catch (error: any) {
      if (error.status === 404) {
        try {
          await octokit.repos.createInOrg({
            org: owner,
            name: repositoryName,
            description: `X-Bot project: ${appName}`,
            private: true,
            auto_init: true,
          })
          console.log(`[X-Bot Create Project] Created GitHub repo: ${repositoryName}`)
        } catch (createError: any) {
          console.error('[X-Bot Create Project] GitHub repo create error:', createError.message)
        }
      }
    }

    // Initialize GitHub repository with sandbox content
    if (process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER) {
      try {
        await sandbox.commands.run('ls -la /home/user/app', { timeoutMs: 5000 })
        await githubService.initializeRepository(
          sandbox,
          projectId,
          repositoryName,
          `Initial commit for X-Bot project: ${appName}`
        )
        console.log(`[X-Bot Create Project] Initialized GitHub repo`)
      } catch (error) {
        console.error('[X-Bot Create Project] GitHub init error:', error)
      }
    }

    return NextResponse.json({
      success: true,
      projectId,
      sandboxId: sandbox.sandboxId,
      title: appName,
      repositoryName,
      imageUrls,
    })
  } catch (error: any) {
    console.error('[X-Bot Create Project] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create project' },
      { status: 500 }
    )
  }
}
