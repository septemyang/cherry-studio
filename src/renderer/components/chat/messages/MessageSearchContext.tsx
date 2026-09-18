import { createContext, type PropsWithChildren, use, useMemo, useState } from 'react'

import type { MessageTextSearchMatch } from './list/messageSearch'

export interface MessageSearchRequest {
  query: string
  matches: MessageTextSearchMatch[]
  current: MessageTextSearchMatch | null
  locateMessage?: (messageId: string) => void
}

const MessageSearchContext = createContext<{
  request: MessageSearchRequest | null
  setRequest: (request: MessageSearchRequest | null) => void
} | null>(null)

export function MessageSearchProvider({ children }: PropsWithChildren) {
  const [request, setRequest] = useState<MessageSearchRequest | null>(null)
  const value = useMemo(() => ({ request, setRequest }), [request])
  return <MessageSearchContext value={value}>{children}</MessageSearchContext>
}

export function useMessageSearch() {
  return use(MessageSearchContext)
}
