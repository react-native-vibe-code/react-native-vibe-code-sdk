import Newsletter1 from './newsletter_1'

export interface NewsletterTemplate {
  name: string
  subject: string
  issueNumber: number
  issueDate: string
  component: typeof Newsletter1
}

export const newsletterTemplates: NewsletterTemplate[] = [
  {
    name: 'newsletter_1',
    subject: "What's New at React Native Vibe Code",
    issueNumber: 1,
    issueDate: 'March 2026',
    component: Newsletter1,
  },
]

export function getTemplate(name: string) {
  return newsletterTemplates.find((t) => t.name === name)
}
