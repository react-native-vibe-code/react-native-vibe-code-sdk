import { db, sandboxSessions, eq } from '@react-native-vibe-code/database'
import { count } from 'drizzle-orm'
import type { CanCreateSandboxResult, SandboxUsage } from '../types/index'

export const BYOK_CONFIG = {
  FREE_SESSION_LIMIT: 10,       // 10 sessions
  MINUTES_PER_SESSION: 30,      // 30 min per session
  FREE_HOURS_LIMIT: 5,          // 5 hours total
} as const

export async function getUserSandboxUsage(userId: string): Promise<SandboxUsage> {
  const result = await db
    .select({ count: count() })
    .from(sandboxSessions)
    .where(eq(sandboxSessions.userId, userId))

  const sessionsUsed = result[0]?.count ?? 0
  return {
    sessionsUsed,
    sessionLimit: BYOK_CONFIG.FREE_SESSION_LIMIT,
    hoursUsed: Math.round((sessionsUsed * BYOK_CONFIG.MINUTES_PER_SESSION) / 60 * 10) / 10,
    hoursLimit: BYOK_CONFIG.FREE_HOURS_LIMIT,
  }
}

export async function canUserCreateSandbox(userId: string): Promise<CanCreateSandboxResult> {
  const usage = await getUserSandboxUsage(userId)
  return {
    canCreate: usage.sessionsUsed < BYOK_CONFIG.FREE_SESSION_LIMIT,
    sessionsUsed: usage.sessionsUsed,
    sessionLimit: BYOK_CONFIG.FREE_SESSION_LIMIT,
  }
}

export async function recordSandboxSession(userId: string, sandboxId: string): Promise<void> {
  await db.insert(sandboxSessions).values({ userId, sandboxId })
}
