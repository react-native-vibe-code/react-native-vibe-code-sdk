export const generateAPIUrl = (relativePath: string) => {
  const path = relativePath.startsWith('/') ? relativePath : `/${relativePath}`

  // Always use the API base URL for backend requests
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://www.reactnativevibecode.com'

  return baseUrl.concat(path)
}
