import { getServerSession } from '@/lib/auth/index'
import { HomeClient } from '@/components/home-client'
import { opencodeEnabled } from '@/flags'

export default async function Home() {
  const session = await getServerSession()
  const showOpencode = await opencodeEnabled()

  return (
    <main className="flex flex-col min-h-dvh">
      <div className="md:h-dvh flex">
        <HomeClient initialSession={session} opencodeEnabled={!!showOpencode} />
      </div>
    </main>
  )
}
