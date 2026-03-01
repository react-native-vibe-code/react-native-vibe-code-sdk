import { db } from '@/lib/db'
import { privacyPolicies } from '@react-native-vibe-code/database'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import { Metadata } from 'next'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params

  const [policy] = await db
    .select()
    .from(privacyPolicies)
    .where(eq(privacyPolicies.id, id))
    .limit(1)

  if (!policy) {
    return {
      title: 'Privacy Policy Not Found',
    }
  }

  return {
    title: `Privacy Policy - ${policy.appName}`,
    description: `Privacy Policy for ${policy.appName}${policy.companyName ? ` by ${policy.companyName}` : ''}`,
  }
}

export default async function PublicPolicyPage({ params }: Props) {
  const { id } = await params

  const [policy] = await db
    .select()
    .from(privacyPolicies)
    .where(eq(privacyPolicies.id, id))
    .limit(1)

  if (!policy || !policy.generatedPolicy) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-12 md:py-16">
        {/* Header */}
        <header className="mb-8 pb-8 border-b border-gray-200">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Privacy Policy
          </h1>
          <p className="text-lg text-gray-600">
            {policy.appName}
            {policy.companyName && (
              <span className="text-gray-400"> by {policy.companyName}</span>
            )}
          </p>
          {policy.updatedAt && (
            <p className="text-sm text-gray-400 mt-2">
              Last updated: {new Date(policy.updatedAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          )}
        </header>

        {/* Policy Content */}
        <article className="prose prose-gray max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-li:text-gray-700 prose-strong:text-gray-900 prose-a:text-purple-600 hover:prose-a:text-purple-700">
          <ReactMarkdown>{policy.generatedPolicy}</ReactMarkdown>
        </article>

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-gray-200 text-center">
          <p className="text-sm text-gray-400">
            Generated with{' '}
            <a
              href="https://reactnativevibecode.com/privacy-policy-generator"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-600 hover:text-purple-700"
            >
              Capsule Privacy Policy Generator
            </a>
          </p>
        </footer>
      </div>
    </div>
  )
}
