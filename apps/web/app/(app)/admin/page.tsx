import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/index'
import { AdminPanel } from './admin-panel'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await getServerSession()
  const adminEmail = process.env.ADMIN_EMAIL

  if (!session?.user?.email || !adminEmail || session.user.email !== adminEmail) {
    redirect('/')
  }

  return (
    <main className="min-h-dvh bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <AdminPanel />
      </div>
    </main>
  )
}
