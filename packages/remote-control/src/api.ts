import { fetch as expoFetch } from 'expo/fetch'

export const generateAPIUrl = (baseUrl: string, relativePath: string) => {
  const path = relativePath.startsWith('/') ? relativePath : `/${relativePath}`
  return baseUrl.concat(path)
}

export const dotFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url

  const fetchOptions: any = { ...init }

  if (fetchOptions.body === null) {
    delete fetchOptions.body
  }

  return await expoFetch(url, fetchOptions)
}
