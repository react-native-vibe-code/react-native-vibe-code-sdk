import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import fs from 'fs-extra'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const TEMPLATE_REPO = 'react-native-vibe-code/react-native-vibe-code-sdk/packages/sandbox/local-expo-app'

function validateProjectName(name: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)
}

function detectPackageManager(): 'pnpm' | 'yarn' | 'bun' | 'npm' {
  try {
    execSync('pnpm --version', { stdio: 'ignore' })
    return 'pnpm'
  } catch {}
  try {
    execSync('yarn --version', { stdio: 'ignore' })
    return 'yarn'
  } catch {}
  try {
    execSync('bun --version', { stdio: 'ignore' })
    return 'bun'
  } catch {}
  return 'npm'
}

function installCommand(pm: string): string {
  return pm === 'yarn' ? 'yarn' : `${pm} install`
}

function generateClaudeMd(projectName: string): string {
  const templatePath = path.resolve(__dirname, '..', 'templates', 'CLAUDE.md')
  const template = fs.readFileSync(templatePath, 'utf-8')
  return template.replace(/\{\{PROJECT_NAME\}\}/g, projectName)
}

async function setupClaudeCode(targetDir: string, projectName: string) {
  const claudeDir = path.join(targetDir, '.claude')
  await fs.ensureDir(claudeDir)
  await fs.writeFile(path.join(targetDir, 'CLAUDE.md'), generateClaudeMd(projectName))
}

async function createProject(projectName: string, options: { skipInstall?: boolean }) {
  const targetDir = path.resolve(process.cwd(), projectName)

  if (fs.existsSync(targetDir)) {
    console.error(chalk.red(`Error: Directory "${projectName}" already exists.`))
    process.exit(1)
  }

  console.log()
  console.log(chalk.bold(`Creating a new React Native Vibe Code project in ${chalk.cyan(projectName)}`))
  console.log()

  // Download template
  const spinner = ora('Downloading template...').start()

  try {
    // degit is ESM-only, dynamic import
    const degit = (await import('degit')).default
    const emitter = degit(TEMPLATE_REPO, {
      cache: false,
      force: true,
      verbose: false,
    })

    await emitter.clone(targetDir)
    spinner.succeed('Template downloaded')
  } catch (error) {
    spinner.fail('Failed to download template')
    console.error(
      chalk.red('\nCould not download the template. Make sure you have internet access.'),
    )
    if (error instanceof Error) {
      console.error(chalk.dim(error.message))
    }
    process.exit(1)
  }

  // Update package.json name
  const pkgPath = path.join(targetDir, 'package.json')
  if (fs.existsSync(pkgPath)) {
    const pkg = await fs.readJson(pkgPath)
    pkg.name = projectName
    delete pkg.private
    await fs.writeJson(pkgPath, pkg, { spaces: 2 })
  }

  // Update app.json name and slug
  const appJsonPath = path.join(targetDir, 'app.json')
  if (fs.existsSync(appJsonPath)) {
    const appJson = await fs.readJson(appJsonPath)
    if (appJson.expo) {
      appJson.expo.name = projectName
      appJson.expo.slug = projectName
      appJson.expo.scheme = projectName
    }
    await fs.writeJson(appJsonPath, appJson, { spaces: 2 })
  }

  // Set up Claude Code
  const claudeSpinner = ora('Setting up Claude Code...').start()
  try {
    await setupClaudeCode(targetDir, projectName)
    claudeSpinner.succeed('Claude Code configured')
  } catch {
    claudeSpinner.warn('Could not set up Claude Code configuration')
  }

  // Install dependencies
  if (!options.skipInstall) {
    const pm = detectPackageManager()
    const installSpinner = ora(`Installing dependencies with ${pm}...`).start()

    try {
      execSync(installCommand(pm), {
        cwd: targetDir,
        stdio: 'pipe',
      })
      installSpinner.succeed(`Dependencies installed with ${pm}`)
    } catch {
      installSpinner.warn(`Could not install dependencies. Run ${chalk.cyan(installCommand(pm))} manually.`)
    }
  }

  // Success message
  console.log()
  console.log(chalk.green.bold('Success!'), `Created ${chalk.cyan(projectName)}`)
  console.log()
  console.log('Get started:')
  console.log()
  console.log(chalk.cyan(`  cd ${projectName}`))
  if (options.skipInstall) {
    console.log(chalk.cyan('  npm install'))
  }
  console.log(chalk.cyan('  npx expo start'))
  console.log()
  console.log(chalk.dim('Claude Code is pre-configured via CLAUDE.md'))
  console.log()

  // Promo boxes
  const boxWidth = 58
  const border = chalk.cyan('┌' + '─'.repeat(boxWidth) + '┐')
  const borderBottom = chalk.cyan('└' + '─'.repeat(boxWidth) + '┘')
  const emptyLine = chalk.cyan('│') + ' '.repeat(boxWidth) + chalk.cyan('│')
  const boxLine = (text: string) => {
    const stripped = text.replace(/\u001b\[[0-9;]*m/g, '')
    const padding = boxWidth - stripped.length
    return chalk.cyan('│') + ' ' + text + ' '.repeat(Math.max(0, padding - 1)) + chalk.cyan('│')
  }

  console.log(border)
  console.log(emptyLine)
  console.log(boxLine(chalk.bold('The free and open source')))
  console.log(boxLine(chalk.bold('React Native Vibe Code SDK and IDE')))
  console.log(emptyLine)
  console.log(boxLine(chalk.bold('Try the full vibe coding experience at')))
  console.log(boxLine(chalk.blue.underline('https://reactnativevibecode.com')))
  console.log(emptyLine)
  console.log(borderBottom)
  console.log()

  process.exit(0)
}

const program = new Command()

program
  .name('create-rnvibecode')
  .description('Create a new React Native Vibe Code project')
  .version('0.0.6')
  .argument('<project-name>', 'Name of the project to create')
  .option('--skip-install', 'Skip dependency installation')
  .action(async (projectName: string, options: { skipInstall?: boolean }) => {
    if (!validateProjectName(projectName)) {
      console.error(
        chalk.red(
          `Invalid project name "${projectName}". Must start with a letter and contain only letters, numbers, hyphens, or underscores.`,
        ),
      )
      process.exit(1)
    }

    try {
      await createProject(projectName, options)
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error)
      process.exit(1)
    }
  })

program.addHelpText('after', `
${chalk.bold('Examples:')}
  ${chalk.cyan('npx create-rnvibecode my-app')}          Create a new project
  ${chalk.cyan('npx create-rnvibecode my-app --skip-install')}   Create without installing deps

${chalk.bold('What you get:')}
  Expo SDK 54 starter with 67+ packages pre-configured for
  AI-powered mobile app development with React Native.
  Includes CLAUDE.md for Claude Code integration.

${chalk.bold('Learn more:')}
  ${chalk.blue('https://github.com/react-native-vibe-code/react-native-vibe-code-sdk')}
`)

program.parse()
