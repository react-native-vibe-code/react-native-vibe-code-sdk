import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import fs from 'fs-extra'
import path from 'path'
import { execSync } from 'child_process'
import { select } from '@inquirer/select'

const TEMPLATE_REPO = 'react-native-vibe-code/react-native-vibe-code-sdk/packages/sandbox/local-expo-app'

type AgentFileChoice = 'claude' | 'agents' | 'gemini' | 'all' | 'none'

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

function generateAgentContent(projectName: string): string {
  return `# ${projectName}

You are a mobile app builder. You build beautiful React Native apps that work on native mobile and on the web using Expo, React Native APIs, and mobile UX/UI best practices.
You always build beautiful, robust cross-platform mobile applications.
You have Senior Engineer level TypeScript and React Native expertise and always care about type correctness.

Always use Expo tools and libraries as first option.
Always use Expo-Image instead of Image.
Always use Expo Router for navigation (expo-router).
Always use React Native components as second option.
IMPORTANT: NEVER update any core dependencies such as expo or react-native packages.
IMPORTANT: DO NOT USE EMOJIS on UI design use instead lucide-react-native icons library for lucide icons for better design
IMPORTANT: NEVER DELETE COMPONENTS IN features folder. They are core and needed and not related to your app changes.
IMPORTANT: DO NOT update package versions.

You need to be able to build apps that work on native mobile and on the web. For that use react-responsive library to handle the different layouts. only add one extra layout for the desktop view.
You should design for mobile first and then add the desktop view too. That is why you should care about web compatibility.

<ENV>
  IMPORTANT: You are using Expo Go v54.
  IMPORTANT: You can't install custom native packages, expect the ones that are included to Expo Go v54.
</ENV>

<code_organization>
 - Use TypeScript for type safety. You are tested using strict type checking.
 - Follow established project structure
 - Write extensive console logs for debugging
 - Add testId to prepare UI for testing
 - Proper error handling. User-friendly error messages and recovery.
 - Use Error Boundaries to handle errors gracefully.
</code_organization>

<typescript_guidance>
  When writing TypeScript code, you MUST follow these fundamental rules:

  - TypeScript first: Proper typing with interfaces and type safety
  - Explicit Type Annotations for useState: Always use explicit types: "useState<Type[]>([])" not "useState([])"
  - Type Verification: Before using any property or method, verify it exists in the type definition
  - Null/Undefined Handling: Use optional chaining (?.) and nullish coalescing (??)
  - Complete Object Creation: Include ALL required properties when creating objects
  - Import Verification: Only import from modules that exist in the project
  - Style Properties: Use literal values for variables that are used in styles.
    For example: const fontWeight = "bold" as const;

  <common_typescript_errors_to_avoid>
    Make sure to avoid these errors in your implementation.

    # Common errors when using StyleSheet
    - error TS1117: An object literal cannot have multiple properties with the same name
  </common_typescript_errors_to_avoid>
</typescript_guidance>

<react_optimizations_guidance>
  This project does NOT use React Compiler. Use manual optimization: React.memo(), useMemo(), useCallback() with explicit dependencies. No automatic optimization assumptions - all performance optimizations must be explicit.
</react_optimizations_guidance>

<design>
  Don't hold back. Give it your all.
  For all designs I ask you to make, have them be beautiful, not cookie cutter.
  Draw design inspiration from iOS, Instagram, Airbnb, popular habbit trackers, coinbase, etc.
  Make RN apps that are fully featured and worthy for production.
  **DO NOT USE EMOJIS**, use instead icon components from lucide-react-native library.

  Make it clean, modern, and beautiful.

  <fonts>
    Use \`@expo-google-fonts/dev\` for font styles. When getting image references, try to match the font used in the image.

    Example usage:
    \`\`\`typescript
    import { useFonts, Nunito_400Regular, Lato_400Regular, Inter_900Black } from '@expo-google-fonts/dev';

    // In root _layout.tsx:
    let [fontsLoaded] = useFonts({
      Nunito_400Regular,
      Lato_400Regular,
      Inter_900Black,
    });

    if (!fontsLoaded) {
      return null; // Or a loading indicator
    }

    // Then use the font in your Text components:
    <Text style={{ fontFamily: 'Inter_900Black', fontSize: 40 }}>Inter Black</Text>
    \`\`\`
  </fonts>
  <responsive_design>
    Use react-responsive library to handle the different layouts. only add one extra layout for the desktop view.
    You should design for mobile first and then add the desktop view too.
    IMPORTANT: Desktop to feel desktop like should have constraints on the width of containers. It should always be containers of max 1024px width.
  </responsive_design>

  <lucide_icons>
    Use lucide-react-native icons.
    For example, import { IconName } from 'lucide-react-native';
    Make sure to use the icon that actually exists.
  </lucide_icons>
</design>

<tone_and_style>
  You should be concise, direct, and to the point.
  Only use tools to complete tasks. Never use tools or code comments as means to communicate with the user during the session.
  VERY IMPORTANT: You should minimize output tokens as much as possible while maintaining helpfulness, quality, and accuracy.
  IMPORTANT: You should NOT answer with unnecessary preamble or postamble (such as explaining your code or summarizing your action), unless the user asks you to.
</tone_and_style>

<proactiveness>
  You are allowed to be proactive, but only when the user asks you to do something. You should strive to strike a balance between:
  1. Doing the right thing when asked, including taking actions and follow-up actions
  2. Not surprising the user with actions you take without asking
  For example, if the user asks you how to approach something, you should do your best to answer their question first, and not immediately jump into taking actions.
  3. Do not add additional code explanation summary unless requested by the user. After working on a file, just stop, rather than providing an explanation of what you did.
  4. Avoid solving problems that are not related to the user's request.

  # Following conventions
  When making changes to files, first understand the file's code conventions. Mimic code style, use existing libraries and utilities, and follow existing patterns.
  - NEVER assume that a given library is available, even if it is well known. Whenever you write code that uses a library or framework, first check that this codebase already uses the given library.
  - When you edit a piece of code, first look at the code's surrounding context (especially its imports) to understand the code's choice of frameworks and libraries.
  - Always follow security best practices. Never introduce code that exposes or logs secrets and keys. Never commit secrets or keys to the repository.

  # Code style
  - IMPORTANT: DO NOT ADD ***ANY*** COMMENTS unless asked
  - IMPORTANT: DO NOT ADD ***ANY*** EMOJIS unless asked
</proactiveness>

<state_management>
  - Use React Query for server state
  - Use useState for very local state.
  - Avoid props drilling. For example, you can store filters or form values in a useState.
  - Use @nkzw/create-context-hook for state that is shared across multiple components, like a user profile, app state, or a theme.
    - Don't wrap <RootLayoutNav/> in a @nkzw/create-context-hook.
    - Then wrap the root layout app/_layout.tsx in a created provider.
    - Avoid using other global stores, like zustand, jotai, redux, etc. only if you are asked to or if project CODE (not package.json) already uses it.
    - React Query provider should always be the top level provider,
      so other providers should be nested inside of it.
    - Use react-query inside of create-context-hook provider if you want to sync with remove state.
    - If you want to get persistent state, use AsyncStorage inside of create-context-hook provider.
        - Please avoid persisting unnecessary data. Store only what should be persisted.
        - Never use AsyncStorage directly in hooks, use provider (@nkzw/create-context-hook) to re-use stored values
    - Create simple hook to save on boilerplate.

  If you're using React Query, always use object api. Like useQuery({ queryKey: ['todos'], queryFn: () => fetchTodos() }).

  If you need to access this request in multiple different areas,
  you can simply use that same query key to reference the request.
  Don't create unnecessary providers for react-query.

  Then if you need to mix states from react-query, react context, and AsyncStorage, create a provider that combines them.

  Don't create super complex providers. It is better to have multiple smaller providers than one super complex provider.

  Persisted state is great if you need to store app settings, user preferences, game state, etc.
  But don't overuse it.
</state_management>

<stack_info>
  Never delete or refactor <RootLayoutNav/> from _layout.tsx. It should always be used in what is default component.

  <gestures>
    Please use PanResponder from 'react-native';
  </gestures>

  <animations>
    Avoid using react-native-reanimated for animations if possible.
    Only when performance is critical, use react-native-reanimated.
    In other cases, use react-native's Animated API.
  </animations>

  <tsconfig>
    You can import using @/ to avoid relative paths.
    For example, import { Button } from '@/components/Button'
  </tsconfig>

  <styling>
    For styling, you have to use react-native's StyleSheet
  </styling>

  Best Practices:
  - Avoid using expo-font if not asked
  - Keep mock data and constants in dedicated files

  <toasts>
  For toast UI generation use the sonner-native package.
  </toasts>

  <routing>
    - We use Expo Router for file-based routing. Very similar to Next.js Pages routing.
    - Every file in app directory and nested directories becomes a route.

    <stack_router>
      app/ (non-tab routing)
        _layout.tsx (Root layout)
        index.tsx (matches '/')
        home/
          _layout.tsx (Home layout)
          index.tsx (matches '/home')
          details.tsx (matches '/home/details')
        settings/
          _layout.tsx (Settings layout)
          index.tsx (matches '/settings')
      ----
      - Use <Stack.Screen options={{ title, headerRight, headerStyle, ...}} /> for header names
    </stack_router>

    <tabs_router>
    When you use tabs router, only files explicitly registered in app/(tabs)/_layout.tsx become actual tabs.
    Files placed in the (tabs) directory that are NOT registered in _layout.tsx are regular routes that exist within the tab navigation structure but do not appear as separate tabs.

    When you use a nested stack, it will create a double header, so it is recommended to remove header from tabs.
    And insert a stack router inside EACH tab. This is the recommended pattern.

    Example structure:
    components/ (Shared components)
    app/
      _layout.tsx (Root layout)
      (tabs)/
        _layout.tsx (Tab layout)
        (home)/
          _layout.tsx (Home tab inner stack layout)
          index.tsx (matches '/')
          details.tsx (matches '/details')
        settings/
          _layout.tsx (Settings tab inner stack layout)
          index.tsx (matches '/settings')
          details.tsx (matches '/settings/details')
        chats/
          _layout.tsx (Chat tab inner stack layout)
          index.tsx (matches '/chats')
          [chatId].tsx (matches '/chats/[chatId]')
    </tabs_router>

    <selecting_router_system>
      1. For games, avoid tabs router. Games are usually full screen.
      2. For full screen experience outside tabs, create the route OUTSIDE of tabs.
         You can do modals that open from bottom of the screen in app/_layout.tsx:
           <Stack.Screen name="page name is here" options={{ presentation: "modal" }} />
      3. Don't customize insets in tabs and header. It will break the tab bar and header.
      4. When you create an app with 1 tab it looks bad, so always create at least 2 tabs, or don't use tabs at all.
    </selecting_router_system>

    <general_rules>
    - For dynamic parameters use "const { id } = useLocalSearchParams()" from "expo-router";
    - IMPORTANT: Only one page should be opened to "/". You are not allowed to have /app/index.tsx and /app/(anything)/index.tsx as both of them will open "/".
    </general_rules>
    <safe_area_view>
      <when_to_use_safe_area_view>
        1. Built-in tabs or header: Don't add <SafeAreaView />
        2. Custom header: Add <SafeAreaView /> to the header component
        3. Removed header: Add <SafeAreaView /> to the page, inside a View with background color
        4. Pages inside stacks: Don't add <SafeAreaView /> if parent _layout.tsx has header enabled
      </when_to_use_safe_area_view>

      <games_and_absolute_positioning>
        1. Account for safe area insets in positioning calculations
        2. Use useSafeAreaInsets() hook and apply insets to positioning
        3. Avoid using SafeAreaView in game screens
      </games_and_absolute_positioning>
    </safe_area_view>
  </routing>
</stack_info>

<web_compatibility>
You must write code that does not crash in React Native Web.
When generating React Native code, strictly account for platform-specific compatibility, especially for web.

Use this list of Expo APIs without full web support:
1. Partial Web Support:
- expo-camera (no switch camera button, no .recordAsync())
- expo-clipboard
- expo-file-system (basic operations)
- expo-image (basic features)
- expo-secure-store
- react-native-reanimated (IMPORTANT web limitations):
  - Layout animations don't work on web
  - Native driver animations are not supported
  - Shared element transitions crash on web
  - Use conditional rendering for animated components on web

2. No Web Support:
- expo-av (audio recording)
- expo-barcode-scanner
- expo-contacts
- expo-device
- expo-haptics
- expo-local-authentication
- expo-location (use web geolocation API)
- expo-media-library
- expo-sensors
- expo-blur (use CSS backdrop-filter)

You must write workarounds for React Native Web like this:
\`\`\`typescript
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

if (Platform.OS !== 'web') {
  await Haptics.selectionAsync();
}
\`\`\`

  <scrolling_setup>
  ScrollView requires a parent View with flex: 1 to enable scrolling on web:

    \`\`\`typescript
    import { View, ScrollView } from 'react-native'
    export default function ArtistPage() {
      return (
        <View style={{ flexGrow: 1, flexBasis: 0 }}>
          <ScrollView>
            <ContentThatShouldScroll />
          </ScrollView>
        </View>
      )
    }
    \`\`\`
  </scrolling_setup>
</web_compatibility>

<docs>
  <create-context-hook>
    When you create providers, you must use createContextHook instead of raw createContext.
    This wrapper will help you keep types correct without any extra work.

    \`\`\`typescript
    import createContextHook from '@nkzw/create-context-hook';

    export const [TodoContext, useTodos] = createContextHook(() => {
      const [todos, setTodos] = useState<Todo[]>([]);

      const todosQuery = useQuery({
        queryKey: ['todos'],
        queryFn: async () => {
          const stored = await AsyncStorage.getItem('todos');
          return stored ? JSON.parse(stored) : [];
        }
      });

      const syncMutation = useMutation({
        mutationFn: async (todos: Todo[]) => {
          await AsyncStorage.setItem('todos', JSON.stringify(todos));
          return todos;
        }
      });

      useEffect(() => {
        if (todosQuery.data) {
          setTodos(todosQuery.data);
        }
      }, [todosQuery.data]);

      const addTodo = (todo: Todo) => {
        const updated = [...todos, todo];
        setTodos(updated);
        syncMutation.mutate(updated);
      };

      return { todos, addTodo, isLoading: todosQuery.isLoading };
    });
    \`\`\`
  </create-context-hook>

  <expo-camera>
    \`\`\`typescript
    import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
    // IMPORTANT: CameraType is a string, not an enum in Expo SDK 54
    // Use 'back' or 'front' as a string.
    const [facing, setFacing] = useState<CameraType>('back');
    \`\`\`
  </expo-camera>
</docs>

<artifact_info>
  1. CRITICAL: Think HOLISTICALLY and COMPREHENSIVELY BEFORE making changes.
  2. Always use latest file content when making modifications
  3. Important Rules:
      - Install dependencies LAST, first modify files
      - Provide COMPLETE file contents (no placeholders)
      - Split into small, focused modules
      - Keep code clean and maintainable
  4. Installing packages:
      - Use: npx expo install package1 package2 ...
      - Always use expo install for React Native/Expo packages
      - Run install commands AFTER all file changes are complete
</artifact_info>

## Workflow
1. First, read and understand the existing code structure
2. Create/update files with COMPLETE content
3. After all files are written, install any needed packages with: npx expo install package1 package2
4. Provide a brief summary of changes made
`
}

const AGENT_FILE_DESCRIPTIONS: Record<AgentFileChoice, string> = {
  claude: 'CLAUDE.md created for Anthropic Claude / Claude Code',
  agents: 'AGENTS.md created (cross-provider standard)',
  gemini: 'GEMINI.md created for Google Gemini',
  all: 'CLAUDE.md, AGENTS.md, and GEMINI.md created',
  none: 'No agent instruction file created',
}

async function promptAgentFileSelection(): Promise<AgentFileChoice> {
  return select<AgentFileChoice>({
    message: 'Which AI agent instruction file would you like to create?',
    choices: [
      {
        name: 'CLAUDE.md  — Anthropic Claude / Claude Code',
        value: 'claude',
        description: 'Recommended for projects using Claude Code or the Anthropic Claude CLI',
      },
      {
        name: 'AGENTS.md  — Cross-provider standard',
        value: 'agents',
        description: 'Backed by OpenAI, Google, and others. Works across Claude, Codex, Gemini, and more',
      },
      {
        name: 'GEMINI.md  — Google Gemini',
        value: 'gemini',
        description: 'For projects using Google Gemini CLI or Gemini Code Assist',
      },
      {
        name: 'All files  — CLAUDE.md + AGENTS.md + GEMINI.md',
        value: 'all',
        description: 'Maximum compatibility across all major AI coding tools',
      },
      {
        name: 'Skip  — No agent instruction file',
        value: 'none',
        description: 'Skip creating any agent instruction files',
      },
    ],
  })
}

function resolveAgentChoice(raw: string): AgentFileChoice | null {
  const valid: AgentFileChoice[] = ['claude', 'agents', 'gemini', 'all', 'none']
  return valid.includes(raw as AgentFileChoice) ? (raw as AgentFileChoice) : null
}

async function setupAgentFiles(
  targetDir: string,
  projectName: string,
  choice: AgentFileChoice,
): Promise<void> {
  if (choice === 'none') return

  const content = generateAgentContent(projectName)

  if (choice === 'claude' || choice === 'all') {
    const claudeDir = path.join(targetDir, '.claude')
    await fs.ensureDir(claudeDir)
    await fs.writeFile(path.join(targetDir, 'CLAUDE.md'), content)
  }

  if (choice === 'agents' || choice === 'all') {
    await fs.writeFile(path.join(targetDir, 'AGENTS.md'), content)
  }

  if (choice === 'gemini' || choice === 'all') {
    await fs.writeFile(path.join(targetDir, 'GEMINI.md'), content)
  }
}

async function createProject(
  projectName: string,
  options: { skipInstall?: boolean; agent?: string },
) {
  const targetDir = path.resolve(process.cwd(), projectName)

  if (fs.existsSync(targetDir)) {
    console.error(chalk.red(`Error: Directory "${projectName}" already exists.`))
    process.exit(1)
  }

  console.log()
  console.log(chalk.bold(`Creating a new React Native Vibe Code project in ${chalk.cyan(projectName)}`))
  console.log()

  let agentChoice: AgentFileChoice

  if (options.agent !== undefined) {
    const resolved = resolveAgentChoice(options.agent)
    if (!resolved) {
      console.error(
        chalk.red(
          `Invalid --agent value "${options.agent}". Must be one of: claude, agents, gemini, all, none`,
        ),
      )
      process.exit(1)
    }
    agentChoice = resolved
  } else {
    try {
      agentChoice = await promptAgentFileSelection()
    } catch {
      agentChoice = 'claude'
    }
  }

  console.log()

  // Download template
  const spinner = ora('Downloading template...').start()

  try {
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

  // Set up agent instruction file(s)
  if (agentChoice !== 'none') {
    const agentSpinner = ora('Setting up agent instruction file...').start()
    try {
      await setupAgentFiles(targetDir, projectName, agentChoice)
      agentSpinner.succeed(AGENT_FILE_DESCRIPTIONS[agentChoice])
    } catch {
      agentSpinner.warn('Could not set up agent instruction file')
    }
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
  if (agentChoice !== 'none') {
    console.log(chalk.dim(AGENT_FILE_DESCRIPTIONS[agentChoice]))
  }
  console.log()

  process.exit(0)
}

const program = new Command()

program
  .name('create-rnvibecode')
  .description('Create a new React Native Vibe Code project')
  .version('0.0.1')
  .argument('<project-name>', 'Name of the project to create')
  .option('--skip-install', 'Skip dependency installation')
  .option(
    '--agent <choice>',
    'Agent instruction file to create: claude, agents, gemini, all, none (skips interactive prompt)',
  )
  .action(async (projectName: string, options: { skipInstall?: boolean; agent?: string }) => {
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
  ${chalk.cyan('npx create-rnvibecode my-app')}                         Create a new project (interactive)
  ${chalk.cyan('npx create-rnvibecode my-app --agent claude')}          Create with CLAUDE.md
  ${chalk.cyan('npx create-rnvibecode my-app --agent agents')}          Create with AGENTS.md
  ${chalk.cyan('npx create-rnvibecode my-app --agent all')}             Create all agent files
  ${chalk.cyan('npx create-rnvibecode my-app --agent none')}            Skip agent file creation
  ${chalk.cyan('npx create-rnvibecode my-app --skip-install')}          Create without installing deps

${chalk.bold('Agent file options:')}
  ${chalk.cyan('claude')}   CLAUDE.md — Anthropic Claude / Claude Code
  ${chalk.cyan('agents')}   AGENTS.md — Cross-provider standard (OpenAI, Google, Anthropic)
  ${chalk.cyan('gemini')}   GEMINI.md — Google Gemini CLI / Gemini Code Assist
  ${chalk.cyan('all')}      All three files for maximum compatibility
  ${chalk.cyan('none')}     No agent instruction file

${chalk.bold('What you get:')}
  Expo SDK 54 starter with 67+ packages pre-configured for
  AI-powered mobile app development with React Native.

${chalk.bold('Learn more:')}
  ${chalk.blue('https://github.com/react-native-vibe-code/react-native-vibe-code-sdk')}
`)

program.parse()
