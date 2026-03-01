import { db, user, session, account, verification, subscriptions, eq } from '@react-native-vibe-code/database'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { polar, checkout, portal, usage } from '@polar-sh/better-auth'
import { Polar } from '@polar-sh/sdk'
import { CONFIG } from '@react-native-vibe-code/config'
import { sendWelcomeEmail } from '@/lib/email'

const polarClient = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
  server: process.env.POLAR_SERVER! as 'production' | 'sandbox',
})

// Calculate reset date (1st of next month)
function getNextResetDate(): Date {
  const now = new Date()
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return nextMonth
}

// Map plan names to message limits
function getMessageLimitForPlan(planName?: string): string {
  if (!planName) return CONFIG.FREE_PLAN_MESSAGE_LIMIT.toString()

  switch (planName.toLowerCase()) {
    case 'start':
      return CONFIG.PAID_PLAN_LIMITS.start.toString()
    case 'pro':
      return CONFIG.PAID_PLAN_LIMITS.pro.toString()
    case 'senior':
      return CONFIG.PAID_PLAN_LIMITS.senior.toString()
    default:
      return CONFIG.FREE_PLAN_MESSAGE_LIMIT.toString()
  }
}

// Get the base URL from environment or Vercel URL
const getBaseURL = () => {
  // First priority: NEXT_PUBLIC_APP_URL (for local development)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }
  // In production, use Vercel URL if available
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  // In production with custom domain
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL
  }
  // Default for local development
  return 'http://localhost:3210'
}

// Helper function to ensure user has a subscription entry
async function ensureUserSubscription(userId: string, customerId?: string) {
  try {
    // Check if subscription already exists
    const existingSub = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1)

    if (existingSub.length === 0) {
      // Create default free subscription for user
      await db.insert(subscriptions).values({
        userId,
        customerId: customerId || null,
        currentPlan: 'free',
        status: 'inactive',
        messageLimit: CONFIG.FREE_PLAN_MESSAGE_LIMIT.toString(),
        resetDate: getNextResetDate(),
        metadata: { createdVia: 'auto-ensure' },
      })
      return true
    } else if (customerId && !existingSub[0].customerId) {
      // Update with customer ID if it's missing
      await db
        .update(subscriptions)
        .set({
          customerId: customerId,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.userId, userId))
      return true
    }
    return false
  } catch (error) {
    console.error('[Auth] Failed to ensure subscription for user:', userId, error)
    return false
  }
}

export const auth = betterAuth({
  baseURL: process.env.NODE_ENV === 'production' ? process.env.NEXT_PUBLIC_PROD_URL || 'https://www.reactnativevibecode.com' : getBaseURL(),
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user,
      session,
      account,
      verification,
    },
    usePlural: false, // Fix for Neon compatibility
  }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  emailAndPassword: {
    enabled: false, // We only want Google OAuth
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Send welcome email when a new user is created (non-blocking)
          sendWelcomeEmail({ name: user.name, email: user.email }).catch((err) => {
            console.error('[Auth] Failed to send welcome email:', err)
          })
        },
      },
    },
  },
  plugins: [
    nextCookies(), // Required for proper cookie handling in Next.js
    polar({
      client: polarClient,
      createCustomerOnSignUp: true,
      onCustomerCreated: async (customer: any, user: any) => {
        // Ensure subscription exists with customer ID when Polar customer is created
        await ensureUserSubscription(user.id, customer.id)
      },
      use: [
        checkout({
          products: [{
            productId: process.env.NEXT_PUBLIC_POLAR_PRO_PRODUCT_ID!,
            slug: "pro"
          }],
          successUrl: "/success?checkout_id={CHECKOUT_ID}",
          authenticatedUsersOnly: true
        }),
        portal(),
        usage()
      ]
    })
  ],
  trustedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    'https://capsule-ide.vercel.app',
    // Primary domain
    'https://www.reactnativevibecode.com',
    'https://reactnativevibecode.com',
    ...(process.env.ADDITIONAL_TRUSTED_ORIGINS ? process.env.ADDITIONAL_TRUSTED_ORIGINS.split(',') : []),
    'http://localhost:3000',
    'http://localhost:3210',
    'capsule://', // Expo app deep link scheme
    'exp://localhost:8081', // Expo development server
    ...(process.env.EXPO_DEV_URL ? [process.env.EXPO_DEV_URL] : []), // Expo Go on local network (set EXPO_DEV_URL)
    // Wildcard patterns for sandbox and deployment environments
    /^https:\/\/.*\.e2b\.dev$/, // E2B sandbox environments
    /^https:\/\/.*\.pages\.dev$/, // Cloudflare Pages deployments
    /^https:\/\/.*\.capsulethis\.app$/, // Capsule app instances
    /^https:\/\/.*\.reactnativevibecode\.com$/, // React Native Vibe Code subdomains
  ].filter(Boolean) as (string | RegExp)[],
})
