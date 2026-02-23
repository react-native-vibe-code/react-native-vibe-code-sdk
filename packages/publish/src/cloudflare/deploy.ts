/**
 * Cloudflare Pages Deployment
 *
 * Deploys web applications to Cloudflare Pages using Wrangler.
 * This handles the complete deployment flow including:
 * - Building the web app in the E2B sandbox
 * - Creating Cloudflare Pages projects
 * - Deploying to Cloudflare Pages
 * - Setting up custom domains
 *
 * @see README.md for required environment variables
 */

import { getSandboxProvider } from '@react-native-vibe-code/sandbox/lib'
import { customAlphabet } from 'nanoid'
import { addCustomDomain, verifyCustomDomain } from './custom-domain'
import type { CloudflareDeployOptions, CloudflareDeployResult } from '../types'

/**
 * Sanitize an app name for Cloudflare Pages compatibility
 * - Lowercase
 * - Only alphanumeric and hyphens
 * - No consecutive hyphens
 * - No leading/trailing hyphens
 */
export function sanitizeAppName(appName: string): string {
  return appName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-') // Replace non-alphanumeric chars with hyphens
    .replace(/-+/g, '-') // Replace multiple consecutive hyphens with single hyphen
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
}

/**
 * Generate a unique deployment name with nanoid suffix
 */
export function generateDeploymentName(appName: string): string {
  const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 7)
  const sanitized = sanitizeAppName(appName)
  return `${sanitized}-${nanoid()}`
}

/**
 * Deploy a web build to Cloudflare Pages using Wrangler
 *
 * @param options - Deployment configuration
 * @returns Deployment result with URLs and status
 *
 * @example
 * ```typescript
 * import { deployToCloudflare } from '@react-native-vibe-code/publish'
 *
 * const result = await deployToCloudflare({
 *   sandboxId: 'sbx-123',
 *   projectId: 'proj-456',
 *   appName: 'my-app'
 * })
 *
 * if (result.success) {
 *   console.log('Deployed to:', result.deploymentUrl)
 * }
 * ```
 */
export async function deployToCloudflare(
  options: CloudflareDeployOptions
): Promise<CloudflareDeployResult> {
  const {
    sandboxId,
    projectId,
    appName,
    appPath = '/home/user/app',
    existingProjectName,
    useExactName,
    existingCustomDomain
  } = options

  // Determine deployment name: use existing project or create new one
  const isUpdate = !!existingProjectName
  let deploymentName: string

  // Sanitize the app name for Cloudflare Pages compatibility
  const sanitizedAppName = sanitizeAppName(appName)

  if (existingProjectName) {
    // Update mode: use the existing Cloudflare project name
    deploymentName = existingProjectName
  } else if (useExactName) {
    // Custom domain mode: use the sanitized name exactly (already verified as available)
    deploymentName = sanitizedAppName
  } else {
    // New deployment without custom domain: create unique name with nanoid suffix
    deploymentName = generateDeploymentName(appName)
  }

  try {
    console.log(`[Cloudflare Deploy] Starting deployment for project ${projectId}`)
    console.log(`[Cloudflare Deploy] App name: ${appName}`)
    console.log(`[Cloudflare Deploy] Deployment name: ${deploymentName}`)
    console.log(`[Cloudflare Deploy] Sandbox ID received: ${sandboxId}`)
    console.log(`[Cloudflare Deploy] About to connect to sandbox...`)

    // Connect to the sandbox using the active provider
    const sandbox = await getSandboxProvider().connect(sandboxId)
    console.log(`[Cloudflare Deploy] Successfully connected to sandbox: ${sandbox.sandboxId}`)

    // Step 1: Build the web app
    console.log('[Cloudflare Deploy] Building web app...')
    const buildResult = await sandbox.commands.run(
      `cd ${appPath} && bun run build:web`,
      {
        onStdout: (data) => console.log('[Build]', data),
        onStderr: (data) => console.error('[Build Error]', data),
        timeoutMs: 300000, // 5 minutes
      }
    )

    if (buildResult.exitCode !== 0) {
      return {
        success: false,
        message: 'Expo web build failed',
        error: buildResult.stderr,
        output: buildResult.stdout,
      }
    }

    console.log('[Cloudflare Deploy] Build completed successfully')

    // Step 2: Deploy to Cloudflare Pages using wrangler
    console.log('[Cloudflare Deploy] Deploying to Cloudflare Pages...')

    const CF_API_TOKEN = process.env.CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN
    const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID

    if (!CF_API_TOKEN) {
      return {
        success: false,
        message: 'Cloudflare API token not configured',
        error: 'CF_API_TOKEN or CLOUDFLARE_API_TOKEN environment variable is required',
      }
    }

    // Step 2a: Create the Cloudflare Pages project first (skip if updating existing)
    if (!isUpdate) {
      console.log(`[Cloudflare Deploy] Creating Cloudflare Pages project: ${deploymentName}`)
      const createProjectResult = await sandbox.commands.run(
        `cd ${appPath} && export CLOUDFLARE_API_TOKEN="${CF_API_TOKEN}" && ${
          CF_ACCOUNT_ID ? `export CLOUDFLARE_ACCOUNT_ID="${CF_ACCOUNT_ID}" && ` : ''
        }bunx wrangler pages project create ${deploymentName} --production-branch=main`,
        {
          onStdout: (data) => console.log('[Wrangler Create]', data),
          onStderr: (data) => console.log('[Wrangler Create Info]', data),
          timeoutMs: 30000, // 30 seconds
        }
      )

      // Ignore errors if project already exists
      if (createProjectResult.exitCode !== 0 && !createProjectResult.stderr.includes('already exists')) {
        console.log('[Cloudflare Deploy] Project creation failed, but continuing with deployment...')
      }
    } else {
      console.log(`[Cloudflare Deploy] Updating existing Cloudflare Pages project: ${deploymentName}`)
    }

    // Step 2b: Deploy to the project
    console.log('[Cloudflare Deploy] Deploying to Cloudflare Pages...')
    const deployResult = await sandbox.commands.run(
      `cd ${appPath} && export CLOUDFLARE_API_TOKEN="${CF_API_TOKEN}" && ${
        CF_ACCOUNT_ID ? `export CLOUDFLARE_ACCOUNT_ID="${CF_ACCOUNT_ID}" && ` : ''
      }bunx wrangler pages deploy dist --project-name=${deploymentName} --branch=main`,
      {
        onStdout: (data) => console.log('[Wrangler]', data),
        onStderr: (data) => console.log('[Wrangler Info]', data),
        timeoutMs: 120000, // 2 minutes
      }
    )

    if (deployResult.exitCode !== 0) {
      return {
        success: false,
        message: 'Cloudflare deployment failed',
        error: deployResult.stderr,
        output: deployResult.stdout,
      }
    }

    // Cloudflare Pages URL is always <project-name>.pages.dev
    const pagesDevUrl = `https://${deploymentName}.pages.dev`

    console.log(`[Cloudflare Deploy] Deployment successful!`)
    console.log(`[Cloudflare Deploy] Pages.dev URL: ${pagesDevUrl}`)

    // Step 3: Set up custom domain
    // For NEW deployments: create DNS record and register domain
    // For UPDATES: verify and fix domain configuration if needed
    let customDomainUrl: string | undefined

    if (!isUpdate) {
      console.log('[Cloudflare Deploy] Adding custom domain for new deployment...')
      const customDomainResult = await addCustomDomain(deploymentName)

      if (customDomainResult.success && customDomainResult.customDomain) {
        customDomainUrl = `https://${customDomainResult.customDomain}`
        console.log(`[Cloudflare Deploy] Custom domain assigned: ${customDomainUrl}`)
        console.log(`[Cloudflare Deploy] Domain status: ${customDomainResult.status}`)
      } else {
        console.warn(`[Cloudflare Deploy] Custom domain failed: ${customDomainResult.error}`)
        console.warn('[Cloudflare Deploy] Falling back to pages.dev URL')
      }
    } else {
      // For updates, verify the custom domain is properly configured
      // This handles cases where:
      // 1. Initial domain setup failed/was incomplete
      // 2. DNS record was deleted or points to wrong target
      // 3. Domain was removed from Pages project
      // Use existingCustomDomain if provided (user's chosen subdomain), otherwise fall back to deploymentName
      const subdomainToVerify = existingCustomDomain || deploymentName
      console.log(`[Cloudflare Deploy] Verifying custom domain for update: ${subdomainToVerify}`)
      const verifyResult = await verifyCustomDomain(deploymentName, subdomainToVerify)

      if (verifyResult.success && verifyResult.customDomain) {
        customDomainUrl = `https://${verifyResult.customDomain}`
        console.log(`[Cloudflare Deploy] Custom domain verified: ${customDomainUrl}`)
        console.log(`[Cloudflare Deploy] Domain status: ${verifyResult.status}`)
      } else {
        console.warn(`[Cloudflare Deploy] Custom domain verification failed: ${verifyResult.error}`)
        console.warn('[Cloudflare Deploy] Using pages.dev URL as fallback')
        // Don't set customDomainUrl - we'll fall back to pagesDevUrl
      }
    }

    // Use custom domain as primary URL, fall back to pages.dev
    const deploymentUrl = customDomainUrl || pagesDevUrl

    return {
      success: true,
      message: 'Successfully deployed to Cloudflare Pages',
      deploymentUrl,
      customDomainUrl,
      pagesDevUrl,
      deploymentName,
      buildPath: `${appPath}/dist`,
      output: deployResult.stdout,
    }
  } catch (error: any) {
    console.error('[Cloudflare Deploy] Error:', error)
    return {
      success: false,
      message: 'Deployment error occurred',
      error: error.message || String(error),
    }
  }
}
