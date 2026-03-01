// Auth configuration for Expo app
export const AUTH_CONFIG = {
  // Base URL for the Better Auth backend
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || 'https://www.reactnativevibecode.com',

  // Google OAuth credentials
  googleClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '',

  // Deep link scheme for the app
  scheme: 'capsule',

  // OAuth endpoints (using Better Auth)
  endpoints: {
    authorize: '/api/auth/authorize/google',
    token: '/api/auth/token/google',
    session: '/api/auth/session',
    signOut: '/api/auth/sign-out',
  },
}
