import { fetch as expoFetch } from 'expo/fetch'
import { getSession } from '@/features/floating-chat/lib/auth/client'

export const generateAPIUrl = (relativePath: string) => {
  const path = relativePath.startsWith('/') ? relativePath : `/${relativePath}`

  // Always use the API base URL for backend requests
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://www.reactnativevibecode.com'

  return baseUrl.concat(path)
}

// Authenticated fetch that includes the access token
export const authenticatedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  // Get the current session
  const session = await getSession()

  // Merge headers with authorization if session exists
  const headers = new Headers(init?.headers || {})

  if (session?.accessToken) {
    headers.set('Authorization', `Bearer ${session.accessToken}`)
  }

  // Convert URL to string for expo fetch
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url

  // Filter out null body if present
  const fetchOptions: any = {
    ...init,
    headers,
  }

  // expo/fetch doesn't accept null body
  if (fetchOptions.body === null) {
    delete fetchOptions.body
  }

  // Make the request with authentication headers
  return await expoFetch(url, fetchOptions)
}

// Streaming-optimized authenticated fetch (same as authenticatedFetch, kept for compatibility)
export const streamingAuthenticatedFetch = authenticatedFetch
