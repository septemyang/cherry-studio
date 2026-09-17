import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Input } from '@cherrystudio/ui'
import { useConversationHistoryQuery } from '@renderer/hooks/useConversationHistoryQuery'

interface Props {
  topicId?: string
  sessionId?: string
  onLocateMessage?: (messageId: string) => void
}

export function QuestionHistoryPanel({ topicId, sessionId, onLocateMessage }: Props) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string>()
  const topic = useConversationHistoryQuery('/topics/:topicId/messages', {
    params: { topicId: topicId ?? '' },
    query: { includeSiblings: false },
    enabled: !!topicId,
    limit: 200,
    swrOptions: { revalidateFirstPage: false, keepPreviousData: false }
  })
  const session = useConversationHistoryQuery('/agent-sessions/:sessionId/messages', {
    params: { sessionId: sessionId ?? '' },
    query: { deferToolOutputs: true },
    enabled: !!sessionId,
    limit: 200,
    swrOptions: { revalidateFirstPage: false, keepPreviousData: false }
  })
  const { hasNext, loadNext, isLoading, isRefreshing, error, refresh } = sessionId ? session : topic
  useEffect(() => {
    if (hasNext && !isLoading && !isRefreshing && !error) loadNext()
  }, [hasNext, loadNext, isLoading, isRefreshing, error])

  const questions = useMemo(() => {
    const messages = sessionId
      ? session.pages.flatMap((page) => page.items).filter((message) => message.sessionId === sessionId)
      : topic.pages
          .flatMap((page) => page.items.map((item) => item.message))
          .filter((message) => message.topicId === topicId)
    const unique = new Map(
      messages.filter((message) => message.role === 'user').map((message) => [message.id, message])
    )
    return [...unique.values()]
      .map((message) => ({ id: message.id, text: message.searchableText.trim(), createdAt: message.createdAt }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
  }, [sessionId, topicId, session.pages, topic.pages])
  const query = search.trim().toLocaleLowerCase()
  const matches = questions.filter((question) => question.text.toLocaleLowerCase().includes(query))
  const loading = isLoading || isRefreshing || (hasNext && !error)

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <Input
        autoFocus
        aria-label={t('common.search')}
        placeholder={t('common.search')}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={loading}>
        <ul className="space-y-1">
          {matches.map((question) => (
            <li key={question.id}>
              <Button
                variant="ghost"
                className="h-auto w-full flex-col items-start gap-1 whitespace-normal px-3 py-2 text-left aria-pressed:bg-accent"
                aria-pressed={selectedId === question.id}
                title={question.text || t('chat.user')}
                onClick={() => {
                  setSelectedId(question.id)
                  onLocateMessage?.(question.id)
                }}>
                <span className="line-clamp-3 w-full wrap-break-word">{question.text || t('chat.user')}</span>
                <time className="text-muted-foreground text-xs" dateTime={question.createdAt}>
                  {new Date(question.createdAt).toLocaleString()}
                </time>
              </Button>
            </li>
          ))}
        </ul>
        {!loading && !error && matches.length === 0 && (
          <p className="p-4 text-center text-muted-foreground text-sm">{t('common.no_results')}</p>
        )}
        {loading && (
          <p role="status" className="p-3 text-center text-muted-foreground text-sm">
            {t('common.loading')}
          </p>
        )}
        {error && (
          <Button variant="ghost" onClick={() => void refresh()}>
            {t('common.retry')}
          </Button>
        )}
      </div>
    </div>
  )
}
