/**
 * Static Bundle Builder Service
 * Builds Expo static bundles in sandboxes and uploads to Vercel Blob.
 * Compatible with any ISandbox provider (E2B, Daytona, etc.)
 */

import type { ISandbox } from './providers/types'
import { put } from '@vercel/blob'
import { generateManifest, validateManifest } from './generate-manifest'
import { db, projects, commits, eq } from '@react-native-vibe-code/database'

interface BundleBuildResult {
  success: boolean
  manifestUrl: string
  bundleUrl: string
  commitId: string
  error?: string
}

interface BundleFile {
  path: string
  content: Buffer
}

/**
 * Build static bundle for iOS in E2B sandbox
 */
export async function buildStaticBundle(
  sandboxId: string,
  projectId: string,
  commitId: string,
  userMessage?: string
): Promise<BundleBuildResult> {
  let sandbox: ISandbox | null = null

  try {
    console.log('[BundleBuilder] Starting bundle build', {
      sandboxId,
      projectId,
      commitId,
    })

    // Connect to existing sandbox using the active provider
    const { getSandboxProvider } = await import('./providers')
    sandbox = await getSandboxProvider().connect(sandboxId)

    // Step 1: Run expo export for iOS
    console.log('[BundleBuilder] Running expo export...')
    const exportResult = await sandbox.commands.run(
      'cd /home/user/app && bunx expo export --platform ios --output-dir dist',
      {
        timeoutMs: 300000, // 5 minutes
      }
    )

    if (exportResult.exitCode !== 0) {
      throw new Error(
        `Expo export failed: ${exportResult.stderr || exportResult.stdout}`
      )
    }

    console.log('[BundleBuilder] Expo export completed')

    // Step 2: Read metadata and assetmap
    const metadataPath = '/home/user/app/dist/metadata.json'
    const assetmapPath = '/home/user/app/dist/assetmap.json'

    const metadataExists = await sandbox.files.exists(metadataPath)
    const assetmapExists = await sandbox.files.exists(assetmapPath)

    if (!metadataExists) {
      throw new Error('metadata.json not found in dist folder')
    }

    const metadataContent = await sandbox.files.read(metadataPath)
    const metadata = JSON.parse(metadataContent)

    const assetmap = assetmapExists
      ? JSON.parse(await sandbox.files.read(assetmapPath))
      : {}

    console.log('[BundleBuilder] Metadata:', metadata)

    // Step 3: Read main JS bundle
    const bundleFileName = metadata.fileMetadata?.ios?.bundle
    if (!bundleFileName) {
      throw new Error('Bundle filename not found in metadata')
    }

    const bundlePath = `/home/user/app/dist/${bundleFileName}`
    const bundleContent = await sandbox.files.read(bundlePath)
    const bundleBuffer = Buffer.from(bundleContent, 'utf-8')

    console.log('[BundleBuilder] Bundle size:', bundleBuffer.length)

    // Step 4: Upload bundle to Vercel Blob
    const basePath = `bundles/${projectId}/${commitId}/`

    const bundleBlob = await put(`${basePath}ios/index.js`, bundleBuffer, {
      access: 'public',
      contentType: 'application/javascript',
    })

    console.log('[BundleBuilder] Bundle uploaded:', bundleBlob.url)

    // Step 5: Read and upload assets
    const assetsPath = '/home/user/app/dist/assets'
    const assetsExist = await sandbox.files.exists(assetsPath)

    const assetsData: Array<{
      filename: string
      content: Buffer
      url: string
    }> = []

    if (assetsExist) {
      // List all asset files
      const listResult = await sandbox.commands.run(
        `cd /home/user/app/dist/assets && find . -type f -printf '%P\\n'`
      )

      const assetFiles = listResult.stdout.trim().split('\n').filter(Boolean)

      console.log('[BundleBuilder] Found assets:', assetFiles.length)

      // Upload each asset
      for (const assetFile of assetFiles) {
        const assetPath = `/home/user/app/dist/assets/${assetFile}`
        const assetContent = await sandbox.files.read(assetPath)
        const assetBuffer = Buffer.from(assetContent, 'binary')

        // Get content type from asset map
        const assetInfo = assetmap[assetFile]
        const extension = assetInfo?.type || assetFile.split('.').pop() || ''

        const contentType = getContentTypeForExtension(extension)

        const assetBlob = await put(
          `${basePath}assets/${assetFile}`,
          assetBuffer,
          {
            access: 'public',
            contentType: contentType,
          }
        )

        assetsData.push({
          filename: assetFile,
          content: assetBuffer,
          url: assetBlob.url,
        })
      }

      console.log('[BundleBuilder] Assets uploaded:', assetsData.length)
    }

    // Step 6: Upload assetmap.json
    const assetmapBlob = await put(
      `${basePath}assetmap.json`,
      JSON.stringify(assetmap),
      {
        access: 'public',
        contentType: 'application/json',
      }
    )

    console.log('[BundleBuilder] Assetmap uploaded:', assetmapBlob.url)

    // Step 7: Generate manifest
    const manifest = await generateManifest({
      projectId,
      commitId,
      bundleContent: bundleBuffer,
      bundleUrl: bundleBlob.url,
      assetMap: assetmap,
      assetsData,
      runtimeVersion: metadata.version?.toString() || '1.0.0',
      metadata: {
        bundler: metadata.bundler || 'metro',
        version: metadata.version || 0,
      },
    })

    // Validate manifest
    if (!validateManifest(manifest)) {
      throw new Error('Generated manifest is invalid')
    }

    // Step 8: Upload manifest
    const manifestBlob = await put(
      `${basePath}ios/manifest.json`,
      JSON.stringify(manifest, null, 2),
      {
        access: 'public',
        contentType: 'application/json',
      }
    )

    console.log('[BundleBuilder] Manifest uploaded:', manifestBlob.url)

    // Step 9: Update project in database
    await db
      .update(projects)
      .set({
        staticBundleUrl: manifestBlob.url,
        githubSHA: commitId,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))

    console.log('[BundleBuilder] Project updated in database')

    // Step 10: Create commit record if userMessage provided
    if (userMessage) {
      await db.insert(commits).values({
        projectId,
        githubSHA: commitId,
        userMessage,
        bundleUrl: manifestBlob.url,
      })

      console.log('[BundleBuilder] Commit record created')
    }

    return {
      success: true,
      manifestUrl: manifestBlob.url,
      bundleUrl: bundleBlob.url,
      commitId,
    }
  } catch (error) {
    console.error('[BundleBuilder] Error building bundle:', error)

    return {
      success: false,
      manifestUrl: '',
      bundleUrl: '',
      commitId,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  } finally {
    // Don't disconnect - let the caller manage sandbox lifecycle
  }
}

/**
 * Get content type for file extension
 */
function getContentTypeForExtension(extension: string): string {
  const ext = extension.startsWith('.') ? extension : `.${extension}`

  const contentTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
  }

  return contentTypes[ext] || 'application/octet-stream'
}

/**
 * Get latest commit SHA from sandbox
 */
export async function getLatestCommitSHA(sandbox: ISandbox): Promise<string> {
  try {
    const result = await sandbox.commands.run(
      'cd /home/user/app && git rev-parse HEAD'
    )

    if (result.exitCode !== 0) {
      throw new Error('Failed to get commit SHA')
    }

    return result.stdout.trim()
  } catch (error) {
    console.error('[BundleBuilder] Error getting commit SHA:', error)
    throw error
  }
}
