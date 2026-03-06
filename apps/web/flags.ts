import { flag } from 'flags/next'
import { vercelAdapter } from '@flags-sdk/vercel'

export const opencodeEnabled = flag<boolean>({
  key: 'opencode',
  adapter: vercelAdapter(),
  defaultValue: false,
})
