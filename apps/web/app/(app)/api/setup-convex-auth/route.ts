// API endpoint to set up Convex Auth with email/password for a project
// Writes auth files directly to the sandbox and commits via git integration

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth/config'
import { headers } from 'next/headers'
import { Sandbox } from '@e2b/code-interpreter'

export const maxDuration = 300 // 5 minutes for package installation

// convex/auth.ts - Password provider configuration
const CONVEX_AUTH_TS = `import { convexAuth } from "@convex-dev/auth/server"
import { Password } from "@convex-dev/auth/providers/Password"

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [Password],
})
`

// convex/auth.config.ts - JWT configuration pointing to Convex site URL
const CONVEX_AUTH_CONFIG_TS = `export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
}
`

// app/(auth)/_layout.tsx
const AUTH_LAYOUT_TSX = `import { Stack } from "expo-router"

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
`

// app/(auth)/sign-in.tsx
const SIGN_IN_TSX = `import { useState } from "react"
import { View, TextInput, StyleSheet, Text, Pressable, Alert, KeyboardAvoidingView, Platform } from "react-native"
import { useAuthActions } from "@convex-dev/auth/react"
import { useRouter } from "expo-router"

export default function SignInScreen() {
  const { signIn } = useAuthActions()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter your email and password")
      return
    }
    setIsLoading(true)
    try {
      await signIn("password", { email, password, flow: "signIn" })
      router.replace("/")
    } catch (error) {
      Alert.alert("Sign In Failed", error instanceof Error ? error.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Sign In</Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
        />
        <Pressable
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>{isLoading ? "Signing in..." : "Sign In"}</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/(auth)/sign-up")}>
          <Text style={styles.link}>Don't have an account? Sign up</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 32,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#000",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  link: {
    textAlign: "center",
    color: "#666",
    fontSize: 14,
  },
})
`

// app/(auth)/sign-up.tsx
const SIGN_UP_TSX = `import { useState } from "react"
import { View, TextInput, StyleSheet, Text, Pressable, Alert, KeyboardAvoidingView, Platform } from "react-native"
import { useAuthActions } from "@convex-dev/auth/react"
import { useRouter } from "expo-router"

export default function SignUpScreen() {
  const { signIn } = useAuthActions()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSignUp = async () => {
    if (!email || !password || !confirmPassword) {
      Alert.alert("Error", "Please fill in all fields")
      return
    }
    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match")
      return
    }
    setIsLoading(true)
    try {
      await signIn("password", { email, password, flow: "signUp" })
      router.replace("/")
    } catch (error) {
      Alert.alert("Sign Up Failed", error instanceof Error ? error.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Create Account</Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoComplete="new-password"
        />
        <Pressable
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleSignUp}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>{isLoading ? "Creating account..." : "Sign Up"}</Text>
        </Pressable>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>Already have an account? Sign in</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 32,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#000",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  link: {
    textAlign: "center",
    color: "#666",
    fontSize: 14,
  },
})
`

/**
 * Injects authTables import and spread into convex/schema.ts
 */
async function updateSchemaWithAuthTables(sandbox: Sandbox): Promise<void> {
  const schemaPath = '/home/user/app/convex/schema.ts'
  let currentContent: string
  try {
    currentContent = await sandbox.files.read(schemaPath)
  } catch {
    console.log('[Auth Setup] convex/schema.ts not found, skipping schema update')
    return
  }

  if (currentContent.includes('authTables')) {
    console.log('[Auth Setup] authTables already present in schema.ts, skipping')
    return
  }

  let newContent = currentContent

  // Add authTables import after last import statement
  const authImport = `import { authTables } from "@convex-dev/auth/server"`
  const importRegex = /^import .+$/gm
  let lastImportMatch: RegExpExecArray | null = null
  let match: RegExpExecArray | null
  while ((match = importRegex.exec(currentContent)) !== null) {
    lastImportMatch = match
  }

  if (lastImportMatch) {
    const insertPos = lastImportMatch.index + lastImportMatch[0].length
    newContent = newContent.slice(0, insertPos) + '\n' + authImport + newContent.slice(insertPos)
  } else {
    newContent = authImport + '\n' + newContent
  }

  // Spread authTables as first entry in defineSchema({...})
  newContent = newContent.replace(
    /defineSchema\(\{/,
    'defineSchema({\n  ...authTables,'
  )

  await sandbox.files.write(schemaPath, newContent)
  console.log('[Auth Setup] Updated convex/schema.ts with authTables')
}

/**
 * Injects auth HTTP routes into convex/http.ts
 */
async function updateHttpWithAuthRoutes(sandbox: Sandbox): Promise<void> {
  const httpPath = '/home/user/app/convex/http.ts'
  let currentContent: string
  try {
    currentContent = await sandbox.files.read(httpPath)
  } catch {
    // http.ts doesn't exist, write a fresh one
    const freshHttpTs = `import { httpRouter } from "convex/server"
import { auth } from "./auth"

const http = httpRouter()

auth.addHttpRoutes(http)

export default http
`
    await sandbox.files.write(httpPath, freshHttpTs)
    console.log('[Auth Setup] Created convex/http.ts with auth routes')
    return
  }

  if (currentContent.includes('auth.addHttpRoutes')) {
    console.log('[Auth Setup] auth routes already present in http.ts, skipping')
    return
  }

  let newContent = currentContent

  // Add auth import after httpRouter import
  const authImport = `import { auth } from "./auth"`
  const httpRouterImportMatch = newContent.match(/^import \{ httpRouter \} from .+$/m)
  if (httpRouterImportMatch) {
    const insertPos = httpRouterImportMatch.index! + httpRouterImportMatch[0].length
    newContent = newContent.slice(0, insertPos) + '\n' + authImport + newContent.slice(insertPos)
  } else {
    newContent = authImport + '\n' + newContent
  }

  // Add auth.addHttpRoutes(http) before export default
  newContent = newContent.replace(
    /export default http/,
    'auth.addHttpRoutes(http)\n\nexport default http'
  )

  await sandbox.files.write(httpPath, newContent)
  console.log('[Auth Setup] Updated convex/http.ts with auth routes')
}

/**
 * Updates app/_layout.tsx to use ConvexAuthProvider instead of ConvexProvider/ConvexWrapper
 */
async function updateLayoutWithConvexAuthProvider(sandbox: Sandbox): Promise<void> {
  const layoutPath = '/home/user/app/app/_layout.tsx'
  let currentContent: string
  try {
    currentContent = await sandbox.files.read(layoutPath)
  } catch {
    console.log('[Auth Setup] app/_layout.tsx not found, skipping layout update')
    return
  }

  if (currentContent.includes('ConvexAuthProvider')) {
    console.log('[Auth Setup] ConvexAuthProvider already present in _layout.tsx, skipping')
    return
  }

  let newContent = currentContent

  if (currentContent.includes('ConvexProvider') && currentContent.includes('ConvexWrapper')) {
    // Cloud enable was run — replace ConvexWrapper pattern with ConvexAuthProvider

    // Replace the ConvexProvider + ConvexReactClient import line
    newContent = newContent.replace(
      /import \{ ConvexProvider, ConvexReactClient \} from ['"]convex\/react['"]\n/,
      `import { ConvexAuthProvider } from "@convex-dev/auth/react-native"\nimport { ConvexReactClient } from "convex/react"\nimport * as SecureStore from "expo-secure-store"\n`
    )

    // Replace the conditional convex client initialization block with a direct one
    newContent = newContent.replace(
      /\/\/ Initialize Convex client\nconst convexUrl = process\.env\.EXPO_PUBLIC_CONVEX_URL\nconst convex = convexUrl\n  \? new ConvexReactClient\(convexUrl, \{ unsavedChangesWarning: false \}\)\n  : null\n/,
      `const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!)\n`
    )

    // Remove the ConvexWrapper component definition
    newContent = newContent.replace(
      /\/\/ Wrapper to conditionally include ConvexProvider\nfunction ConvexWrapper\(\{ children \}: \{ children: React\.ReactNode \}\) \{\n  if \(convex\) \{\n    return <ConvexProvider client=\{convex\}>\{children\}<\/ConvexProvider>\n  \}\n  return <>\{children\}</>\n\}\n/,
      ''
    )

    // Replace <ConvexWrapper> and </ConvexWrapper> JSX tags
    newContent = newContent.replace(
      /<ConvexWrapper>/g,
      `<ConvexAuthProvider client={convex} storage={SecureStore}>`
    )
    newContent = newContent.replace(
      /<\/ConvexWrapper>/g,
      `</ConvexAuthProvider>`
    )
  } else if (currentContent.includes('ConvexProvider')) {
    // ConvexProvider exists but no ConvexWrapper — simpler replacement
    newContent = newContent.replace(
      /import \{ ConvexProvider.*?\} from ['"]convex\/react['"]/,
      `import { ConvexAuthProvider } from "@convex-dev/auth/react-native"\nimport { ConvexReactClient } from "convex/react"\nimport * as SecureStore from "expo-secure-store"`
    )
    newContent = newContent.replace(/<ConvexProvider([^>]*)>/g, `<ConvexAuthProvider client={convex} storage={SecureStore}>`)
    newContent = newContent.replace(/<\/ConvexProvider>/g, `</ConvexAuthProvider>`)
  } else {
    // No Convex provider at all — inject ConvexAuthProvider around the root element
    const authProviderImport = `import { ConvexAuthProvider } from "@convex-dev/auth/react-native"\nimport { ConvexReactClient } from "convex/react"\nimport * as SecureStore from "expo-secure-store"\n\nconst convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!)\n`

    // Find last import and inject after it
    const importRegex = /^import .+$/gm
    let lastImportMatch: RegExpExecArray | null = null
    let match: RegExpExecArray | null
    while ((match = importRegex.exec(currentContent)) !== null) {
      lastImportMatch = match
    }

    if (lastImportMatch) {
      const insertPos = lastImportMatch.index + lastImportMatch[0].length
      newContent = newContent.slice(0, insertPos) + '\n\n' + authProviderImport + newContent.slice(insertPos)
    }

    // Wrap the root return element with ConvexAuthProvider
    console.log('[Auth Setup] No existing ConvexProvider found — manual wrapping may be needed in _layout.tsx')
  }

  await sandbox.files.write(layoutPath, newContent)
  console.log('[Auth Setup] Updated app/_layout.tsx with ConvexAuthProvider')
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { projectId } = body

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
    }

    // Get project with ownership check
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, session.user.id)))
      .limit(1)

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (!project.sandboxId) {
      return NextResponse.json(
        { error: 'No active sandbox found for this project' },
        { status: 400 }
      )
    }

    // Connect to sandbox
    console.log('[Auth Setup] Connecting to sandbox:', project.sandboxId)
    const sandbox = await Sandbox.connect(project.sandboxId)

    // Step 1: Install required packages
    console.log('[Auth Setup] Installing @convex-dev/auth, @auth/core, expo-secure-store...')
    const installResult = await sandbox.commands.run(
      'cd /home/user/app && bun add @convex-dev/auth @auth/core expo-secure-store',
      { timeoutMs: 120000 }
    )
    if (installResult.exitCode !== 0) {
      console.warn('[Auth Setup] Package install stderr:', installResult.stderr)
    }
    console.log('[Auth Setup] Packages installed')

    // Step 2: Write convex/auth.ts
    console.log('[Auth Setup] Writing convex/auth.ts...')
    await sandbox.files.write('/home/user/app/convex/auth.ts', CONVEX_AUTH_TS)

    // Step 3: Write convex/auth.config.ts
    console.log('[Auth Setup] Writing convex/auth.config.ts...')
    await sandbox.files.write('/home/user/app/convex/auth.config.ts', CONVEX_AUTH_CONFIG_TS)

    // Step 4: Update convex/schema.ts with authTables
    console.log('[Auth Setup] Updating convex/schema.ts...')
    await updateSchemaWithAuthTables(sandbox)

    // Step 5: Update convex/http.ts with auth routes
    console.log('[Auth Setup] Updating convex/http.ts...')
    await updateHttpWithAuthRoutes(sandbox)

    // Step 6: Update app/_layout.tsx to use ConvexAuthProvider
    console.log('[Auth Setup] Updating app/_layout.tsx...')
    await updateLayoutWithConvexAuthProvider(sandbox)

    // Step 7: Create auth screens directory and files
    console.log('[Auth Setup] Creating auth screens...')
    await sandbox.commands.run('mkdir -p /home/user/app/app/\\(auth\\)', { timeoutMs: 10000 })
    await sandbox.files.write('/home/user/app/app/(auth)/_layout.tsx', AUTH_LAYOUT_TSX)
    await sandbox.files.write('/home/user/app/app/(auth)/sign-in.tsx', SIGN_IN_TSX)
    await sandbox.files.write('/home/user/app/app/(auth)/sign-up.tsx', SIGN_UP_TSX)

    // Step 8: Commit all changes via git
    console.log('[Auth Setup] Committing changes...')
    try {
      await sandbox.commands.run(
        'cd /home/user/app && git add -A && git commit -m "Setup Convex Auth with email/password authentication"',
        { timeoutMs: 30000 }
      )
      console.log('[Auth Setup] Git commit successful')
    } catch (gitError) {
      console.warn('[Auth Setup] Git commit failed (non-fatal):', gitError)
      // Don't fail the operation if git commit fails
    }

    console.log('[Auth Setup] Convex Auth setup complete')

    return NextResponse.json({
      success: true,
      message: 'Convex Auth setup complete. Note: run "npx @convex-dev/auth" in your project to generate JWT keys and configure CONVEX_SITE_URL in your Convex dashboard.',
    })
  } catch (error) {
    console.error('[Auth Setup] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to setup auth'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
