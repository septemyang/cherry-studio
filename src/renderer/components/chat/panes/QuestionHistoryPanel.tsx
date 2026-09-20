import { ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Input } from '@cherrystudio/ui'
import HighlightText from '@renderer/components/HighlightText'
import { usePreference } from '@renderer/data/hooks/usePreference'
import { useConversationHistoryQuery } from '@renderer/hooks/useConversationHistoryQuery'
import { findTextMatches } from '@renderer/utils/contentSearch'

import { projectMessageSearchDocuments, type MessageTextSearchMatch } from '../messages/list/messageSearch'
import { useMessageSearch } from '../messages/MessageSearchContext'
import type { MessageListItem } from '../messages/types'

interface Props {
  mode?: 'history' | 'search'
  topicId?: string
  sessionId?: string
  onLocateMessage?: (messageId: string) => void
}

export function QuestionHistoryPanel({ mode = 'history', topicId, sessionId, onLocateMessage }: Props) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string>()
  const [renderUserTextAsMarkdown] = usePreference('chat.message.render_as_markdown')
  const searchContext = useMessageSearch()
  const setRequest = searchContext?.setRequest
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
      messages
        .filter((message) => message.role === 'user' || (mode === 'search' && message.role === 'assistant'))
        .map((message) => [message.id, message])
    )
    return [...unique.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
  }, [mode, sessionId, topicId, session.pages, topic.pages])
  const query = search.trim()
  const matches = useMemo(
    () =>
      questions.flatMap((message) => {
        const role = message.role
        if (role !== 'user' && role !== 'assistant') return []
        const item: MessageListItem = {
          id: message.id,
          role,
          status: message.status,
          topicId: topicId ?? sessionId ?? '',
          createdAt: message.createdAt
        }
        const documents =
          mode === 'search'
            ? projectMessageSearchDocuments(
                [item],
                { [message.id]: message.data.parts ?? [] },
                {
                  caseSensitive: false,
                  wholeWord: false,
                  includeUser: true,
                  renderUserTextAsMarkdown
                }
              )
            : [{ text: message.searchableText.trim(), partId: '' }]
        return documents.flatMap((document) => {
          const occurrences = query
            ? findTextMatches(document.text, query, { caseSensitive: false, wholeWord: false })
            : []
          const positions = mode === 'search' ? occurrences : !query ? [{ start: 0, end: 0 }] : occurrences.slice(0, 1)
          return positions.map((position, occurrence) => {
            const start = Math.max(0, position.start - 40)
            const end = Math.min(document.text.length, Math.max(start + 200, position.end + 40))
            const match: MessageTextSearchMatch = {
              type: 'text',
              key: `${document.partId}:${occurrence}`,
              messageId: message.id,
              partId: document.partId,
              role,
              occurrence
            }
            return {
              id: message.id,
              key: mode === 'search' ? match.key : message.id,
              match,
              text: document.text,
              createdAt: message.createdAt,
              excerpt: `${start ? '…' : ''}${document.text.slice(start, end)}${end < document.text.length ? '…' : ''}`
            }
          })
        })
      }),
    [questions, query, mode, topicId, sessionId, renderUserTextAsMarkdown]
  )
  const currentIndex = matches.findIndex((match) => match.key === selectedId)
  const current = matches[currentIndex]?.match ?? null
  const searchMatches = useMemo(() => matches.map((match) => match.match), [matches])
  useEffect(() => {
    if (mode !== 'search') return
    setRequest?.({ query, matches: searchMatches, current, locateMessage: onLocateMessage })
  }, [mode, query, searchMatches, current, onLocateMessage, setRequest])
  useEffect(
    () => () => {
      if (mode === 'search') setRequest?.(null)
    },
    [mode, setRequest]
  )
  const selectMatch = (index: number) => {
    const match = matches[index]
    if (!match) return
    setSelectedId(match.key)
    if (mode === 'history') onLocateMessage?.(match.id)
  }
  const step = (delta: number) => {
    if (!matches.length) return
    selectMatch(
      currentIndex < 0 ? (delta > 0 ? 0 : matches.length - 1) : (currentIndex + delta + matches.length) % matches.length
    )
  }
  const loading = isLoading || isRefreshing || (hasNext && !error)

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <Input
        autoFocus
        aria-label={t('common.search')}
        placeholder={t('common.search')}
        value={search}
        onChange={(event) => {
          setSearch(event.target.value)
          setSelectedId(undefined)
        }}
        onKeyDown={(event) => {
          if (mode === 'search' && event.key === 'Enter') {
            event.preventDefault()
            step(event.shiftKey ? -1 : 1)
          }
        }}
      />
      {mode === 'search' && (
        <div className="flex items-center justify-end gap-1">
          <span role="status" className="mr-auto text-muted-foreground text-sm">
            {currentIndex + 1} / {matches.length}
          </span>
          <Button
            variant="ghost"
            size="icon"
            disabled={!matches.length}
            aria-label={t('common.previous')}
            onClick={() => step(-1)}>
            <ChevronUp size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={!matches.length}
            aria-label={t('common.next')}
            onClick={() => step(1)}>
            <ChevronDown size={16} />
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={loading}>
        <ul className="space-y-1">
          {matches.map((question, index) => (
            <li key={question.key}>
              <Button
                variant="ghost"
                className="h-auto w-full flex-col items-start gap-1 whitespace-normal px-3 py-2 text-left aria-pressed:bg-accent"
                aria-pressed={selectedId === question.key}
                title={question.text || t('chat.user')}
                onClick={() => selectMatch(index)}>
                <span className="line-clamp-3 w-full wrap-break-word">
                  <HighlightText text={question.excerpt || t('chat.user')} keyword={query} />
                </span>
                <time className="text-muted-foreground text-xs" dateTime={question.createdAt}>
                  {new Date(question.createdAt).toLocaleString()}
                </time>
              </Button>
            </li>
          ))}
        </ul>
        {!loading && !error && matches.length === 0 && (
          <p className="p-4 text-center text-muted-foreground text-sm">
            {mode === 'search' && !query ? t('chat.conversation_search_hint') : t('common.no_results')}
          </p>
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
