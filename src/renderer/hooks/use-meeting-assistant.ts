import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { askMeeting, recapRecent, type ChatTurn, type MeetingContext } from '../services/meeting-ai'
import { meetingAIErrorMessage } from '../utils/meeting'

export interface AssistantItem {
  id: string
  kind: 'recap' | 'answer'
  /** The user's question (answers only) */
  question?: string
  answer: string
  pending: boolean
  error: string | null
}

/** Minutes covered by "What did I miss?" */
export const RECAP_MINUTES = 5

let counter = 0
const nextId = (): string => `a${Date.now().toString(36)}${(counter++).toString(36)}`

/**
 * "What did I miss?" recaps and questions about one meeting. `getContext`
 * is read at request time so answers always see the latest transcript.
 * The thread is cleared when `meetingId` changes.
 */
export function useMeetingAssistant(
  meetingId: string | null,
  getContext: () => (MeetingContext & { summary?: string }) | null
): {
  items: AssistantItem[]
  busy: boolean
  ask: (question: string) => void
  recap: () => void
  dismiss: (id: string) => void
  clear: () => void
} {
  const { t } = useTranslation()
  const [items, setItems] = useState<AssistantItem[]>([])
  const contextRef = useRef(getContext)
  contextRef.current = getContext
  // Requests started for an earlier meeting must not land in this one
  const generation = useRef(0)

  useEffect(() => {
    generation.current++
    setItems([])
  }, [meetingId])

  const patch = useCallback((id: string, update: Partial<AssistantItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...update } : item)))
  }, [])

  const run = useCallback(
    (
      item: AssistantItem,
      request: (ctx: MeetingContext & { summary?: string }) => Promise<string>
    ) => {
      const ctx = contextRef.current()
      if (!ctx) return
      const gen = generation.current
      setItems((prev) => [...prev, item])
      request(ctx)
        .then((answer) => {
          if (gen === generation.current) patch(item.id, { answer, pending: false })
        })
        .catch((err: unknown) => {
          if (gen === generation.current) {
            patch(item.id, { pending: false, error: meetingAIErrorMessage(t, err) })
          }
        })
    },
    [patch, t]
  )

  const ask = useCallback(
    (question: string) => {
      const q = question.trim()
      if (!q) return
      const history: ChatTurn[] = []
      for (const item of items) {
        if (item.kind !== 'answer' || item.pending || item.error || !item.question) continue
        history.push(
          { role: 'user', content: item.question },
          { role: 'assistant', content: item.answer }
        )
      }
      run(
        { id: nextId(), kind: 'answer', question: q, answer: '', pending: true, error: null },
        (ctx) => askMeeting(q, ctx, history)
      )
    },
    [items, run]
  )

  const recap = useCallback(() => {
    // One recap at a time: a newer one replaces the previous card
    setItems((prev) => prev.filter((item) => item.kind !== 'recap'))
    run({ id: nextId(), kind: 'recap', answer: '', pending: true, error: null }, (ctx) =>
      recapRecent(ctx, RECAP_MINUTES)
    )
  }, [run])

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  return {
    items,
    busy: items.some((item) => item.pending),
    ask,
    recap,
    dismiss,
    clear
  }
}
