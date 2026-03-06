import { getServerSession } from "@/lib/auth/index"
import { NavHeader } from "@/components/nav-header"
import { PromptDetail } from "@/components/ui-prompts/prompt-detail"

interface Props {
  params: Promise<{ slug: string }>
}

export default async function UiPromptDetailPage({ params }: Props) {
  const [session, { slug }] = await Promise.all([getServerSession(), params])

  return (
    <main className="min-h-dvh bg-background">
      <NavHeader session={session} />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-2 lg:py-12">
        <PromptDetail slug={slug} isAuthenticated={!!session} />
      </div>
    </main>
  )
}
