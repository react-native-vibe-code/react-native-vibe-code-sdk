/**
 * CORS Configuration for Toolkit API Endpoints
 *
 * This module provides CORS utilities for toolkit API routes,
 * allowing sandbox environments to make cross-origin requests.
 */

/**
 * Allowed origins for CORS requests
 */
const ALLOWED_ORIGINS = [
  'https://reactnativevibecode.com',
  'https://www.reactnativevibecode.com',
  'https://capsule-ide.vercel.app',
  'http://localhost:3000',
  'http://localhost:3210',
  'http://localhost:8081',
  'exp://localhost:8081',
  'capsule://',
]

/**
 * Domains that allow any subdomain to make requests
 */
const WILDCARD_ALLOWED_DOMAINS = [
  'e2b.dev',           // E2B sandbox environments
  'pages.dev',         // Cloudflare Pages deployments
  'capsulethis.app',   // User app instances
]

/**
 * Check if origin matches any wildcard domain pattern
 */
function matchesWildcardDomain(origin: string): boolean {
  try {
    const url = new URL(origin)
    const hostname = url.hostname

    return WILDCARD_ALLOWED_DOMAINS.some(domain => {
      if (hostname === domain) return true
      if (hostname.endsWith(`.${domain}`)) return true
      return false
    })
  } catch (error) {
    return false
  }
}

/**
 * Check if an origin is allowed
 */
function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false

  // Allow any localhost or 127.0.0.1 for development
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    return true
  }

  // Allow Expo Go development URLs
  if (origin.startsWith('exp://') && origin.includes(':8081')) {
    return true
  }

  // Allow capsule:// deep links
  if (origin.startsWith('capsule://')) {
    return true
  }

  // Check against wildcard domain patterns
  if (matchesWildcardDomain(origin)) {
    return true
  }

  // Check against allowed origins list
  return ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))
}

/**
 * Get CORS headers based on request origin
 *
 * @param request - The incoming request (optional)
 * @returns CORS headers object
 *
 * @example
 * ```typescript
 * import { getCorsHeaders } from '@react-native-vibe-code/integrations/toolkit'
 *
 * export async function POST(request: Request) {
 *   return Response.json(data, {
 *     headers: getCorsHeaders(request)
 *   })
 * }
 * ```
 */
export function getCorsHeaders(request?: Request): Record<string, string> {
  const origin = request?.headers.get('origin') || '*'

  const allowOrigin = isOriginAllowed(origin) ? origin : '*'
  const allowCredentials = allowOrigin !== '*'

  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version',
    'Access-Control-Max-Age': '86400',
  }

  if (allowCredentials) {
    headers['Access-Control-Allow-Credentials'] = 'true'
  }

  return headers
}

/**
 * Static CORS headers for backward compatibility
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version',
  'Access-Control-Max-Age': '86400',
}

/**
 * Handle CORS preflight requests
 *
 * @param request - The incoming OPTIONS request
 * @returns Response with CORS headers
 *
 * @example
 * ```typescript
 * import { handleCorsOptions } from '@react-native-vibe-code/integrations/toolkit'
 *
 * export async function OPTIONS(request: Request) {
 *   return handleCorsOptions(request)
 * }
 * ```
 */
export function handleCorsOptions(request?: Request): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  })
}
