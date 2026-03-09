'use client'

import Intercom from '@intercom/messenger-js-sdk'
import { useEffect } from 'react'
import { useSession } from '@/lib/auth/client'

export function IntercomWidget() {
  const { data: session } = useSession()
  const user = session?.user

  useEffect(() => {
    if (user) {
      Intercom({
        app_id: 'tuks5afn',
        user_id: user.id,
        name: user.name,
        email: user.email,
        created_at: user.createdAt ? Math.floor(new Date(user.createdAt).getTime() / 1000) : undefined,
      })
    } else {
      Intercom({ app_id: 'tuks5afn' })
    }
  }, [user])

  return null
}
