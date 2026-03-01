/**
 * Allowed origins for CORS requests
 * This includes production domains, development URLs, and mobile app schemes
 */
const ALLOWED_ORIGINS = [
  // Primary domain
  'https://reactnativevibecode.com',
  'https://www.reactnativevibecode.com',
  'https://capsule-ide.vercel.app',
  'http://localhost:3000',
  'http://localhost:3210',
  'http://localhost:8081',
  // Expo development and production
  'exp://localhost:8081',
  'capsule://', // Deep link scheme
]

/**
 * Domains that allow any subdomain to make requests
 * These are typically for sandbox environments and deployment platforms
 */
const WILDCARD_ALLOWED_DOMAINS = [
  'e2b.dev',                  // E2B sandbox environments (*.e2b.dev)
  'pages.dev',                // Cloudflare Pages deployments (*.pages.dev)
  'capsulethis.app',          // User app instances (*.capsulethis.app)
  'reactnativevibecode.com',  // React Native Vibe Code subdomains (*.reactnativevibecode.com)
]

/**
 * Check if origin matches any wildcard domain pattern
 * Examples:
 *   - abc123.e2b.dev matches e2b.dev
 *   - my-app.pages.dev matches pages.dev
 *   - subdomain.project.pages.dev matches pages.dev
 */
function matchesWildcardDomain(origin: string): boolean {
  try {
    const url = new URL(origin)
    const hostname = url.hostname

    return WILDCARD_ALLOWED_DOMAINS.some(domain => {
      // Exact match: e2b.dev === e2b.dev
      if (hostname === domain) return true

      // Subdomain match: abc.e2b.dev ends with .e2b.dev
      if (hostname.endsWith(`.${domain}`)) return true

      return false
    })
  } catch (error) {
    // Invalid URL format
    return false
  }
}

/**
 * Check if an origin is allowed
 */
function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false

  // Allow any localhost or 127.0.0.1 with any port for development
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    return true
  }

  // Allow Expo Go development URLs (exp://192.168.x.x:8081)
  if (origin.startsWith('exp://') && origin.includes(':8081')) {
    return true
  }

  // Allow any capsule:// deep link
  if (origin.startsWith('capsule://')) {
    return true
  }

  // Check against wildcard domain patterns (e.g., *.e2b.dev, *.pages.dev)
  if (matchesWildcardDomain(origin)) {
    return true
  }

  // Check against allowed origins list
  return ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))
}

/**
 * Get CORS headers based on request origin
 */
export function getCorsHeaders(request?: Request): Record<string, string> {
  const origin = request?.headers.get('origin') || '*'

  // For mobile apps and allowed origins, use specific origin with credentials
  // For others, use wildcard without credentials
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
 * Legacy static CORS headers for backward compatibility
 * Use getCorsHeaders() for request-specific headers
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version',
  'Access-Control-Max-Age': '86400',
}

/**
 * Handle CORS preflight requests
 */
export function handleCorsOptions(request?: Request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  })
}
