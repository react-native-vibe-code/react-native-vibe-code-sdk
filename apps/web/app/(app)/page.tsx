import { getServerSession } from '@/lib/auth/index'
import { HomeClient } from '@/components/home-client'
import { LandingFeaturesToggle } from '@/components/landing-features-toggle'

export default async function Home() {
  const session = await getServerSession()

  return (
    <main className="flex flex-col min-h-dvh">
      <div className="md:h-dvh flex">
        <HomeClient initialSession={session} />
      </div>
      {!session && <LandingFeaturesToggle />}
    </main>
  )
}
