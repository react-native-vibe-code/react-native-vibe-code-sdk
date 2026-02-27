/**
 * App Configuration Updaters
 *
 * Helper functions to update app configuration files with generated names.
 * These are used to prepare apps for deployment by updating:
 * - app.json (Expo configuration)
 * - wrangler.toml (Cloudflare Workers configuration)
 */

import type { ISandbox as Sandbox } from '@react-native-vibe-code/sandbox/lib'

/**
 * Update app.json in the sandbox with the fantasy name
 * Updates both name and slug fields
 *
 * @param sandbox - E2B sandbox instance
 * @param fantasyName - The generated app name
 * @param appPath - Path to the app directory (default: /home/user/app)
 *
 * @example
 * ```typescript
 * import { updateAppJsonWithName } from '@react-native-vibe-code/publish/config'
 *
 * await updateAppJsonWithName(sandbox, 'cosmic-phoenix', '/home/user/app')
 * ```
 */
export async function updateAppJsonWithName(
  sandbox: Sandbox,
  fantasyName: string,
  appPath: string = '/home/user/app'
): Promise<void> {
  try {
    // Read the current app.json
    const readResult = await sandbox.commands.run(
      `cat ${appPath}/app.json`,
      { timeoutMs: 5000 }
    )

    if (readResult.exitCode !== 0) {
      console.error(`[App Config] Failed to read app.json: ${readResult.stderr}`)
      return
    }

    // Parse the JSON
    const appConfig = JSON.parse(readResult.stdout)

    // Update the expo config with the fantasy name
    if (appConfig.expo) {
      appConfig.expo.name = fantasyName
      appConfig.expo.slug = fantasyName

      // Also update bundle identifiers to use the fantasy name
      if (appConfig.expo.ios?.bundleIdentifier) {
        appConfig.expo.ios.bundleIdentifier = `com.capsule.${fantasyName.replace(/-/g, '')}`
      }
      if (appConfig.expo.android?.package) {
        appConfig.expo.android.package = `com.capsule.${fantasyName.replace(/-/g, '')}`
      }
    }

    // Write the updated config back
    const updatedJson = JSON.stringify(appConfig, null, 2)

    // Use a temp file to avoid shell escaping issues
    await sandbox.files.write(`${appPath}/app.json`, updatedJson)
  } catch (error) {
    console.error('[App Config] Error updating app.json:', error)
    throw error
  }
}

/**
 * Generate a new wrangler.toml configuration with the fantasy name
 *
 * @param fantasyName - The app name to use in the configuration
 * @returns The wrangler.toml content as a string
 */
export function generateWranglerToml(fantasyName: string): string {
  return `# wrangler.toml
name = "${fantasyName}"
main = "cloudflare/index.ts"
compatibility_date = "2024-01-01"

# Static assets configuration
assets = { directory = "./dist", binding = "ASSETS" }
`
}

/**
 * Update or create wrangler.toml in the sandbox with the fantasy name
 *
 * @param sandbox - E2B sandbox instance
 * @param fantasyName - The generated app name
 * @param appPath - Path to the app directory (default: /home/user/app)
 *
 * @example
 * ```typescript
 * import { updateWranglerTomlWithName } from '@react-native-vibe-code/publish/config'
 *
 * await updateWranglerTomlWithName(sandbox, 'cosmic-phoenix', '/home/user/app')
 * ```
 */
export async function updateWranglerTomlWithName(
  sandbox: Sandbox,
  fantasyName: string,
  appPath: string = '/home/user/app'
): Promise<void> {
  try {
    // Check if wrangler.toml exists
    const checkResult = await sandbox.commands.run(
      `[ -f ${appPath}/wrangler.toml ] && echo "exists" || echo "not-exists"`,
      { timeoutMs: 5000 }
    )

    let wranglerConfig: string

    if (checkResult.stdout.includes('exists')) {
      // Read existing wrangler.toml
      const readResult = await sandbox.commands.run(
        `cat ${appPath}/wrangler.toml`,
        { timeoutMs: 5000 }
      )

      if (readResult.exitCode === 0) {
        wranglerConfig = readResult.stdout

        // Update the name property
        wranglerConfig = wranglerConfig.replace(
          /name\s*=\s*["'].*?["']/,
          `name = "${fantasyName}"`
        )
      } else {
        // If read failed, create new config
        wranglerConfig = generateWranglerToml(fantasyName)
      }
    } else {
      // Create new wrangler.toml
      wranglerConfig = generateWranglerToml(fantasyName)
    }

    // Write the updated/new config
    await sandbox.files.write(`${appPath}/wrangler.toml`, wranglerConfig)
  } catch (error) {
    console.error('[App Config] Error updating wrangler.toml:', error)
    throw error
  }
}

/**
 * Update both app.json and wrangler.toml with the fantasy name
 *
 * @param sandbox - E2B sandbox instance
 * @param fantasyName - The generated app name
 * @param appPath - Path to the app directory (default: /home/user/app)
 *
 * @example
 * ```typescript
 * import { updateAppConfigWithName } from '@react-native-vibe-code/publish/config'
 *
 * await updateAppConfigWithName(sandbox, 'cosmic-phoenix')
 * ```
 */
export async function updateAppConfigWithName(
  sandbox: Sandbox,
  fantasyName: string,
  appPath: string = '/home/user/app'
): Promise<void> {
  await Promise.all([
    updateAppJsonWithName(sandbox, fantasyName, appPath),
    updateWranglerTomlWithName(sandbox, fantasyName, appPath)
  ])
}
