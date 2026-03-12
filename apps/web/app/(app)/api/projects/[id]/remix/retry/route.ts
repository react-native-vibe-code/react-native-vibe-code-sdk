import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { put } from '@vercel/blob'

export const maxDuration = 300

const CHROMIUM_REMOTE_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v141.0.0/chromium-v141.0.0-pack.x64.tar'

let cachedExecutablePath: string | null = null
let downloadPromise: Promise<string> | null = null

async function getChromiumPath(): Promise<string> {
  if (cachedExecutablePath) return cachedExecutablePath

  if (!downloadPromise) {
    const chromium = (await import('@sparticuz/chromium-min')).default
    downloadPromise = chromium
      .executablePath(CHROMIUM_REMOTE_URL)
      .then((path) => {
        cachedExecutablePath = path
        return path
      })
      .catch((error) => {
        downloadPromise = null
        throw error
      })
  }

  return downloadPromise
}

async function waitForUrlReady(
  url: string,
  maxAttempts: number = 10,
  delayMs: number = 3000
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[Screenshot Retry] Checking URL readiness (attempt ${attempt}/${maxAttempts}): ${url}`)
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10000),
      })
      if (response.ok) {
        console.log(`[Screenshot Retry] URL is ready after ${attempt} attempt(s)`)
        return true
      }
    } catch (error) {
      console.log(`[Screenshot Retry] URL not ready yet (attempt ${attempt}): ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  return false
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * GET /api/projects/[id]/remix/retry
 * Manually trigger screenshot capture for a project.
 * No auth required - meant to be called by visiting the URL directly.
 */
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  let browser = null

  try {
    const existingProject = await db
      .select()
      .from(projects)
      .where(eq(projects.id, params.id))
      .limit(1)

    if (existingProject.length === 0) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const project = existingProject[0]

    const url = project.sandboxUrl || project.deployedUrl || project.ngrokUrl
    if (!url) {
      return new Response(
        JSON.stringify({ error: 'No URL available for screenshots' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const fullUrl = url.startsWith('http') ? url : `https://${url}`

    console.log(`[Screenshot Retry] Starting screenshot capture for project ${params.id}`)
    console.log(`[Screenshot Retry] URL: ${fullUrl}`)

    const isUrlReady = await waitForUrlReady(fullUrl, 10, 3000)
    if (!isUrlReady) {
      return new Response(
        JSON.stringify({ error: 'URL is not accessible after multiple attempts' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[Screenshot Retry] URL is accessible, waiting 3 seconds for app to fully load...`)
    await delay(3000)

    const isVercel = !!process.env.VERCEL_ENV

    let puppeteerCore: typeof import('puppeteer-core')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let launchOptions: any = { headless: true, defaultViewport: { width: 1920, height: 1080 } }

    if (isVercel) {
      const chromium = (await import('@sparticuz/chromium-min')).default
      puppeteerCore = await import('puppeteer-core')
      const executablePath = await getChromiumPath()
      launchOptions = {
        ...launchOptions,
        args: chromium.args,
        executablePath,
      }
    } else {
      puppeteerCore = await import('puppeteer-core')
      launchOptions = {
        ...launchOptions,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      }
    }

    browser = await puppeteerCore.launch(launchOptions)
    const page = await browser.newPage()

    // Mobile screenshot
    await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2 })
    await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 60000 })
    await delay(2000)
    const mobileScreenshot = await page.screenshot({ type: 'png' })

    const mobileBlob = await put(
      `screenshots/${params.id}-mobile.png`,
      mobileScreenshot,
      { access: 'public', contentType: 'image/png', allowOverwrite: true }
    )

    // Desktop screenshot
    await page.setViewport({ width: 1920, height: 1080 })
    await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 60000 })
    await delay(2000)
    const desktopScreenshot = await page.screenshot({ type: 'png' })

    const desktopBlob = await put(
      `screenshots/${params.id}-desktop.png`,
      desktopScreenshot,
      { access: 'public', contentType: 'image/png', allowOverwrite: true }
    )

    await browser.close()
    browser = null

    const updatedProject = await db
      .update(projects)
      .set({
        screenshotMobile: mobileBlob.url,
        screenshotDesktop: desktopBlob.url,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, params.id))
      .returning()

    console.log(`[Screenshot Retry] Successfully captured screenshots for project ${params.id}`)

    return new Response(
      JSON.stringify({
        success: true,
        screenshots: {
          mobile: mobileBlob.url,
          desktop: desktopBlob.url,
        },
        project: updatedProject[0],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error(`[Screenshot Retry] Error for project ${params.id}:`, error)

    if (browser) {
      try {
        await browser.close()
      } catch {
        // ignore
      }
    }

    return new Response(
      JSON.stringify({
        error: 'Failed to capture screenshots',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
