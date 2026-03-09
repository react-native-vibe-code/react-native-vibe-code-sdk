import React, { createContext, useContext } from 'react'

export interface DotConfig {
  projectId: string
  apiBaseUrl: string
}

const DotConfigContext = createContext<DotConfig | undefined>(undefined)

export function DotProvider({
  projectId,
  apiBaseUrl,
  children,
}: DotConfig & { children: React.ReactNode }) {
  return (
    <DotConfigContext.Provider value={{ projectId, apiBaseUrl }}>
      {children}
    </DotConfigContext.Provider>
  )
}

export function useDotConfig(): DotConfig {
  const context = useContext(DotConfigContext)
  if (context === undefined) {
    throw new Error('useDotConfig must be used within a <Dot> provider')
  }
  return context
}
