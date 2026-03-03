import { Suspense } from "react"
import { getServerSession } from "@/lib/auth/index"
import { NavHeader } from "@/components/nav-header"
import { PromptGallery } from "@/components/ui-prompts/prompt-gallery"

export default async function UiPromptsPage() {
  const session = await getServerSession()

  return (
    <main className="min-h-dvh bg-background">
      <NavHeader session={session} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4">
            UI Prompts
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Curated collection of AI prompts that generate beautiful React
            Native UIs. Browse, search, and remix designs instantly.
          </p>
        </div>

        {/* Gallery */}
        <Suspense
          fallback={
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-card p-4 animate-pulse"
                >
                  <div className="flex justify-center mb-4">
                    <div className="w-[200px] h-[360px] rounded-2xl bg-muted" />
                  </div>
                  <div className="h-5 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-4 bg-muted rounded w-full mb-1" />
                  <div className="h-4 bg-muted rounded w-2/3" />
                </div>
              ))}
            </div>
          }
        >
          <PromptGallery />
        </Suspense>
      </div>
    </main>
  )
}
