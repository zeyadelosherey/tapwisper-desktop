import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Sparkles, X, Check, Copy, Send, AlertCircle,
  RotateCcw, Maximize2, Minimize2
} from 'lucide-react'
import { expandSnippets, Snippet } from '../models/snippet'
import { useStatsStore } from '../store/stats'
import { useActivityStore } from '../store/activity'
import { processText } from '../services/ai-router'
import {
  BUILT_IN_CATEGORIES,
  type ActionCategory as StoredCategory
} from '../models/actions-config'
import { CATEGORY_COLORS } from '../constants/colors'
import { useOverlayHitRegion } from '../hooks/use-overlay-hit-region'

type PanelMode = 'suggestion' | 'ask-question'

interface ResultEntry {
  id: string
  actionName: string
  actionId: string
  text: string
  timestamp: number
}

/** Everything needed to (re)run an action — kept so a failure can be retried. */
interface ActionRequest {
  actionId: string
  prompt: string
  label: string
  inputText: string
  /** First action on the selected text (vs. a follow-up on a result) */
  isInitial: boolean
}

interface ConversationMessage {
  role: 'user' | 'ai'
  text: string
  isError?: boolean
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err || 'Unknown error')
}

/** Find an action prompt: the user's stored (possibly edited) actions win. */
function findActionPrompt(actionId: string, stored: StoredCategory[] | undefined): string {
  for (const cats of [stored ?? [], BUILT_IN_CATEGORIES]) {
    for (const cat of cats) {
      const action = cat.actions.find((a) => a.id === actionId)
      if (action?.prompt) return action.prompt
    }
  }
  return ''
}

export function AISuggestionPanel(): JSX.Element {
  const { t } = useTranslation()
  const addAIAction = useStatsStore((s) => s.addAIAction)
  const addLLMAction = useActivityStore((s) => s.addLLMAction)
  const [mode, setMode] = useState<PanelMode>('suggestion')
  const [visible, setVisible] = useState(false)
  const [originalText, setOriginalText] = useState('')
  const [processedText, setProcessedText] = useState('')
  const [actionName, setActionName] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [showHint, setShowHint] = useState(true)

  // Error from the last AI request + the request itself (for Retry)
  const [aiError, setAiError] = useState('')
  const lastRequestRef = useRef<ActionRequest | null>(null)

  // "Copied" feedback
  const [copied, setCopied] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Actions sidebar
  const [showActions, setShowActions] = useState(false)
  const [categories, setCategories] = useState<StoredCategory[]>(BUILT_IN_CATEGORIES)

  // Expand panel for more scroll space
  const [isExpanded, setIsExpanded] = useState(false)

  // Result history stack — newest first
  const [resultHistory, setResultHistory] = useState<ResultEntry[]>([])

  // Ask Question mode
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [conversation, setConversation] = useState<ConversationMessage[]>([])

  // Visible card — everything else in the window is click-through
  const cardRef = useRef<HTMLDivElement>(null)
  useOverlayHitRegion(
    [cardRef],
    visible,
    `${mode}-${isExpanded}-${showActions}`
  )

  // Load user-configured actions (merged with built-in)
  const loadCategories = useCallback(() => {
    window.tapwisper.store.get('actions').then((data) => {
      if (data && Array.isArray(data) && (data as StoredCategory[]).length > 0) {
        setCategories(data as StoredCategory[])
      }
    })
  }, [])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  // Reload categories when the window becomes visible (e.g. after adding mini-apps)
  useEffect(() => {
    const onVisibilityChange = (): void => {
      if (!document.hidden) loadCategories()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [loadCategories])

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  /**
   * Run an action through the AI router. On failure the current text is left
   * untouched and an error (with Retry) is shown instead.
   */
  const runAction = useCallback(
    async (request: ActionRequest) => {
      lastRequestRef.current = request
      setAiError('')
      setIsProcessing(true)
      if (request.isInitial) setActionName(request.label)

      try {
        const response = await processText({
          prompt:
            request.prompt ||
            `${request.label} the following text. Only return the result text, nothing else.`,
          text: request.inputText
        })
        const resultText = response.result || request.inputText

        const entry: ResultEntry = {
          id: `${Date.now()}`,
          actionName: request.label,
          actionId: request.actionId,
          text: resultText,
          timestamp: Date.now()
        }
        setProcessedText(resultText)
        setActionName(request.label)
        setResultHistory((prev) => (request.isInitial ? [entry] : [entry, ...prev]))
        lastRequestRef.current = null

        addAIAction(request.actionId, resultText.length)
        addLLMAction({
          llmAction: request.label,
          llmInput: request.inputText,
          llmResult: resultText
        })
      } catch (err) {
        setAiError(getErrorMessage(err))
      } finally {
        setIsProcessing(false)
      }
    },
    [addAIAction, addLLMAction]
  )

  // Keep the IPC listeners below pointed at the latest runAction
  const runActionRef = useRef(runAction)
  runActionRef.current = runAction

  useEffect(() => {
    document.documentElement.classList.add('transparent')

    const unsubProcess = window.tapwisper.on('ai-panel:process', async (data: unknown) => {
      const { text, actionId, label, prompt } = data as {
        text: string
        actionId: string
        label?: string
        prompt?: string
      }

      const storedSnippets = (await window.tapwisper.store.get('snippets')) as
        | Snippet[]
        | undefined
      const expandedText = storedSnippets?.length ? expandSnippets(text, storedSnippets) : text

      const prettyName =
        label || actionId.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())

      setOriginalText(expandedText)
      setProcessedText('')
      setMode('suggestion')
      setVisible(true)
      setResultHistory([])
      setShowActions(false)

      const storedActions = (await window.tapwisper.store.get('actions')) as
        | StoredCategory[]
        | undefined
      const actionPrompt = prompt || findActionPrompt(actionId, storedActions)

      runActionRef.current({
        actionId,
        prompt: actionPrompt,
        label: prettyName,
        inputText: expandedText,
        isInitial: true
      })
    })

    const unsubAsk = window.tapwisper.on('ai-panel:ask-question', async (data: unknown) => {
      const { text } = data as { text: string }

      const storedSnippets = (await window.tapwisper.store.get('snippets')) as
        | Snippet[]
        | undefined
      const expandedText = storedSnippets?.length ? expandSnippets(text, storedSnippets) : text

      setOriginalText(expandedText)
      setMode('ask-question')
      setConversation([])
      setQuestion('')
      setAnswer('')
      setAiError('')
      setResultHistory([])
      setVisible(true)
    })

    return () => {
      unsubProcess()
      unsubAsk()
    }
  }, [])

  // Run a new action on the current (latest) text
  const handleRunAction = useCallback(
    (actionId: string, prompt: string, label: string) => {
      if (isProcessing) return
      const currentText = processedText || originalText
      if (!currentText) return
      runAction({ actionId, prompt, label, inputText: currentText, isInitial: false })
    },
    [isProcessing, processedText, originalText, runAction]
  )

  const handleRetry = useCallback(() => {
    if (lastRequestRef.current && !isProcessing) runAction(lastRequestRef.current)
  }, [isProcessing, runAction])

  const handleClose = useCallback(() => {
    setVisible(false)
    setOriginalText('')
    setProcessedText('')
    setQuestion('')
    setAnswer('')
    setConversation([])
    setResultHistory([])
    setShowActions(false)
    setIsExpanded(false)
    setAiError('')
    setCopied(false)
    lastRequestRef.current = null
    window.tapwisper.window.setAIPanelExpanded(false)
    window.tapwisper.window.hide('aiPanel')
  }, [])

  const handleAccept = useCallback(() => {
    if (!processedText) return
    window.tapwisper.clipboard.insertText(processedText)
    handleClose()
  }, [processedText, handleClose])

  const handleCopy = useCallback(() => {
    const text = mode === 'ask-question' ? answer : processedText
    if (!text) return
    window.tapwisper.clipboard.write(text)
    setCopied(true)
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
  }, [mode, answer, processedText])

  const handleToggleExpand = useCallback(() => {
    const next = !isExpanded
    setIsExpanded(next)
    window.tapwisper.window.setAIPanelExpanded(next)
  }, [isExpanded])

  const handleRevert = useCallback((entryIndex: number) => {
    if (entryIndex >= resultHistory.length - 1) {
      // Revert to original
      setProcessedText(originalText)
      setResultHistory([])
      setActionName('')
    } else {
      // Revert to a previous result
      const target = resultHistory[entryIndex + 1]
      setProcessedText(target.text)
      setActionName(target.actionName)
      setResultHistory((prev) => prev.slice(entryIndex + 1))
    }
  }, [resultHistory, originalText])

  const handleAskSubmit = useCallback(async () => {
    if (!question.trim() || isProcessing) return

    const newConv: ConversationMessage[] = [
      ...conversation,
      { role: 'user', text: question }
    ]
    setConversation(newConv)
    const currentQuestion = question
    setQuestion('')
    setIsProcessing(true)

    try {
      const response = await processText({
        prompt: currentQuestion,
        text: originalText,
        systemInstruction: 'You are a helpful assistant. The user has shared some text and is asking a question about it. Answer their question based on the provided text context. Be concise and helpful.'
      })
      const aiResponse = response.result || 'Sorry, I could not generate a response.'
      setConversation([...newConv, { role: 'ai', text: aiResponse }])
      setAnswer(aiResponse)
      addAIAction('ask-question', aiResponse.length)
      addLLMAction({
        llmAction: 'Ask Question',
        llmInput: `Context: ${originalText}\n\nQuestion: ${currentQuestion}`,
        llmResult: aiResponse
      })
    } catch (err) {
      const errorText = `${t('aiPanel.errorTitle', 'AI request failed')}: ${getErrorMessage(err)}`
      setConversation([...newConv, { role: 'ai', text: errorText, isError: true }])
    } finally {
      setIsProcessing(false)
    }
  }, [question, isProcessing, conversation, originalText, addAIAction, addLLMAction, t])

  if (!visible) return <div className="w-full h-full" />

  // Flatten all actions from visible categories into a single list
  const flatActions = categories
    .filter((c) => c.isVisible !== false)
    .sort((a, b) => a.order - b.order)
    .flatMap((cat) =>
      cat.actions.map((action) => ({
        id: action.id,
        label: action.label,
        prompt: action.prompt,
        color: CATEGORY_COLORS[cat.id] || cat.color
      }))
    )

  const panelSizeClasses = isExpanded
    ? 'w-full max-w-[720px] h-[calc(100vh-24px)] max-h-[90vh] min-h-[400px]'
    : 'w-[420px] max-h-[520px]'

  // Initial action failed: there is no result to accept or copy
  const hasResult = processedText.length > 0

  const errorBox = aiError ? (
    <div
      role="alert"
      className="flex flex-col gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/25"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-400">
            {t('aiPanel.errorTitle', 'AI request failed')}
          </p>
          <p className="text-xs text-theme-text-secondary mt-0.5 break-words">{aiError}</p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        {hasResult && (
          <button
            onClick={() => setAiError('')}
            className="no-drag px-2.5 py-1 rounded-lg text-xs text-theme-text-secondary hover:text-theme-text transition-colors"
          >
            {t('aiPanel.dismiss', 'Dismiss')}
          </button>
        )}
        <button
          onClick={handleRetry}
          disabled={isProcessing}
          className="no-drag flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 text-xs font-medium transition-all disabled:opacity-40"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {t('aiPanel.retry', 'Retry')}
        </button>
      </div>
    </div>
  ) : null

  return (
    <div className="w-full h-full flex items-center justify-center p-3">
      <div
        ref={cardRef}
        className={`flex items-start gap-2 animate-scale-up ${isExpanded ? 'w-full h-full max-w-[740px]' : ''}`}
      >
        {/* ── Main panel ── */}
        <div className={`glass rounded-2xl panel-shadow flex flex-col overflow-hidden ${isExpanded ? 'flex-1' : ''} ${panelSizeClasses}`}>
          {/* Header */}
          <div className="drag-region no-select flex items-center gap-2 px-4 py-3 border-b border-theme-border/50">
            <Sparkles className="w-4 h-4 text-sky-accent no-drag" />
            <span className="flex-1 text-sm font-medium text-theme-text">
              {mode === 'ask-question' ? t('actions.askQuestion') : actionName || 'AI Assistant'}
            </span>
            <div className="flex items-center gap-1.5 no-drag">
              <button
                onClick={handleToggleExpand}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-theme-surface/50 text-theme-text-tertiary hover:text-sky-accent hover:bg-sky-accent/10 transition-all text-xs font-medium"
                title={isExpanded ? t('aiPanel.collapse', 'Collapse panel') : t('aiPanel.expand', 'Expand panel')}
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                <span>{isExpanded ? t('aiPanel.collapse', 'Collapse') : t('aiPanel.expand', 'Expand')}</span>
              </button>
              {mode === 'suggestion' && !isProcessing && processedText && (
                <button
                  onClick={() => setShowActions(!showActions)}
                  className="w-7 h-7 rounded-full bg-theme-surface/50 flex items-center justify-center text-theme-text-tertiary hover:text-sky-accent hover:bg-sky-accent/10 transition-all"
                  title={t('aiPanel.moreActions', 'More actions')}
                  aria-label={t('aiPanel.moreActions', 'More actions')}
                  aria-expanded={showActions}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={handleClose}
                title={t('aiPanel.close', 'Close')}
                aria-label={t('aiPanel.close', 'Close')}
                className="w-7 h-7 rounded-full bg-theme-surface/50 flex items-center justify-center text-theme-text-tertiary hover:text-theme-text hover:bg-theme-surface transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {mode === 'suggestion' && (
              <>
                {isProcessing ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3">
                    {actionName && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-accent/10 border border-sky-accent/20">
                        <Sparkles className="w-3 h-3 text-sky-accent/70" />
                        <span className="text-[11px] font-medium text-sky-accent/70">{actionName}</span>
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 bg-sky-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2.5 h-2.5 bg-sky-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2.5 h-2.5 bg-sky-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {errorBox}

                    {/* Current (latest) result */}
                    {processedText && (
                      <>
                        {/* Action badge for current result */}
                        {actionName && (
                          <div className="flex items-center gap-1.5">
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-accent/10 border border-sky-accent/20">
                              <Sparkles className="w-3 h-3 text-sky-accent/70" />
                              <span className="text-[11px] font-medium text-sky-accent/70">{actionName}</span>
                            </div>
                            {resultHistory.length > 1 && (
                              <span className="text-[10px] text-theme-text-muted">latest</span>
                            )}
                          </div>
                        )}

                        <div className="text-sm text-theme-text leading-relaxed p-3 bg-theme-surface/30 rounded-xl">
                          <span className="diff-added">{processedText}</span>
                        </div>
                      </>
                    )}

                    {/* Previous results (history stack) — shown collapsed */}
                    {resultHistory.length > 1 && (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 border-t border-theme-border/30" />
                          <span className="text-[10px] text-theme-text-muted uppercase tracking-wider">Previous versions</span>
                          <div className="flex-1 border-t border-theme-border/30" />
                        </div>

                        {resultHistory.slice(1).map((entry, idx) => (
                          <div key={entry.id} className="group relative">
                            <div className="flex items-center gap-1.5 mb-1">
                              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-theme-surface/40">
                                <Sparkles className="w-2.5 h-2.5 text-theme-text-tertiary" />
                                <span className="text-[10px] font-medium text-theme-text-tertiary">{entry.actionName}</span>
                              </div>
                              <button
                                onClick={() => handleRevert(idx)}
                                className="no-drag opacity-0 group-hover:opacity-100 focus-visible:opacity-100 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-accent/10 text-sky-accent hover:bg-sky-accent/20 transition-all"
                                title="Revert to this version"
                              >
                                <RotateCcw className="w-2.5 h-2.5" />
                                <span className="text-[10px] font-medium">Revert</span>
                              </button>
                            </div>
                            <div className="text-xs text-theme-text-secondary leading-relaxed p-2.5 bg-theme-surface/20 rounded-lg line-clamp-3 opacity-60">
                              {entry.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Expand hint when collapsed — easy to find for reading/moving */}
                    {!isExpanded && hasResult && (
                      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-theme-surface/40 rounded-lg border border-theme-border/30">
                        <p className="text-xs text-theme-text-secondary">
                          {t('aiPanel.expandToRead', 'Expand panel to read and move it easily. Drag the title bar to move.')}
                        </p>
                        <button
                          onClick={handleToggleExpand}
                          className="no-drag shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-accent/15 text-sky-accent hover:bg-sky-accent/25 text-xs font-medium transition-all"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                          {t('aiPanel.expand', 'Expand')}
                        </button>
                      </div>
                    )}

                    {/* Hint */}
                    {showHint && hasResult && resultHistory.length <= 1 && (
                      <div className="flex items-center justify-between px-3 py-2 bg-sky-accent/10 rounded-lg">
                        <p className="text-xs text-sky-accent/70">
                          {t('aiPanel.revertHint', 'Click the ✨ button to apply more actions')}
                        </p>
                        <button
                          onClick={() => setShowHint(false)}
                          className="no-drag text-xs text-sky-accent/50 hover:text-sky-accent"
                        >
                          {t('aiPanel.dismiss', 'Dismiss')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {mode === 'ask-question' && (
              <div className="space-y-3">
                {/* Expand hint when collapsed */}
                {!isExpanded && (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-theme-surface/40 rounded-lg border border-theme-border/30">
                    <p className="text-xs text-theme-text-secondary">
                      {t('aiPanel.expandToRead', 'Expand panel to read and move it easily. Drag the title bar to move.')}
                    </p>
                    <button
                      onClick={handleToggleExpand}
                      className="no-drag shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-accent/15 text-sky-accent hover:bg-sky-accent/25 text-xs font-medium transition-all"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      {t('aiPanel.expand', 'Expand')}
                    </button>
                  </div>
                )}

                {/* Selected text context */}
                <div className="p-2.5 bg-theme-surface/30 rounded-xl">
                  <p className="text-xs text-theme-text-tertiary mb-1">{t('aiPanel.context', 'Context:')}</p>
                  <p className="text-xs text-theme-text-secondary line-clamp-3">{originalText}</p>
                </div>

                {/* Conversation */}
                {conversation.map((msg, i) => (
                  <div key={i}>
                    {msg.role === 'ai' && i === 1 && !msg.isError && (
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-sky-accent/8 border border-sky-accent/15">
                          <Sparkles className="w-2.5 h-2.5 text-sky-accent/60" />
                          <span className="text-[10px] font-medium text-sky-accent/60">{t('actions.askQuestion')}</span>
                        </div>
                      </div>
                    )}
                    <div
                      role={msg.isError ? 'alert' : undefined}
                      className={`p-3 rounded-xl text-sm whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-sky-accent/10 text-sky-accent ms-8'
                          : msg.isError
                            ? 'bg-red-500/10 border border-red-500/25 text-red-400 me-8'
                            : 'bg-theme-surface/40 text-theme-text me-8'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}

                {isProcessing && (
                  <div className="flex gap-1.5 p-3">
                    <div className="w-2 h-2 bg-sky-accent/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-sky-accent/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-sky-accent/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom bar */}
          <div className="border-t border-theme-border/50 px-4 py-3">
            {mode === 'suggestion' && !isProcessing && (
              <div className="flex items-center justify-between">
                <button
                  onClick={handleCopy}
                  disabled={!hasResult}
                  className="no-drag flex items-center gap-1.5 px-3 py-2 rounded-xl bg-theme-surface/40 text-theme-text-secondary hover:text-theme-text transition-all text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-accent" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  {copied ? t('aiPanel.copied', 'Copied') : t('aiPanel.copy', 'Copy')}
                </button>
                <span className="sr-only" aria-live="polite">
                  {copied ? t('aiPanel.copied', 'Copied') : ''}
                </span>
                <button
                  onClick={handleAccept}
                  disabled={!hasResult}
                  className="no-drag flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-accent text-white font-medium hover:bg-green-accent/80 transition-all text-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-green-accent"
                >
                  <Check className="w-4 h-4" />
                  {t('recording.accept')}
                </button>
              </div>
            )}

            {mode === 'ask-question' && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={t('aiPanel.askPlaceholder', 'Ask a question about this text...')}
                  aria-label={t('aiPanel.askPlaceholder', 'Ask a question about this text...')}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAskSubmit()}
                  className="no-drag flex-1 bg-theme-surface/30 rounded-xl px-3 py-2 text-sm text-theme-text placeholder-theme-text-muted outline-none focus:ring-1 focus:ring-sky-accent/30"
                />
                <button
                  onClick={handleAskSubmit}
                  disabled={!question.trim() || isProcessing}
                  aria-label={t('aiPanel.send', 'Send')}
                  title={t('aiPanel.send', 'Send')}
                  className="no-drag w-9 h-9 rounded-full bg-sky-accent flex items-center justify-center text-white hover:bg-sky-accent/80 transition-all disabled:opacity-30"
                >
                  <Send className="w-4 h-4 rtl-flip" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Actions Sidebar ── */}
        {showActions && mode === 'suggestion' && !isProcessing && (
          <div className={`glass rounded-2xl panel-shadow w-[200px] flex flex-col overflow-hidden animate-scale-up shrink-0 ${isExpanded ? 'max-h-[90vh]' : 'max-h-[520px]'}`}>
            {/* Sidebar header */}
            <div className="no-select px-3 py-2.5 border-b border-theme-border/50">
              <p className="text-xs font-semibold text-theme-text-secondary uppercase tracking-wider">
                Actions
              </p>
            </div>

            {/* Flat action list */}
            <div className="flex-1 overflow-y-auto p-2">
              <div className="flex flex-wrap gap-1.5">
                {flatActions.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => handleRunAction(action.id, action.prompt, action.label)}
                    disabled={isProcessing}
                    className="no-drag px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-all disabled:opacity-30 border hover:scale-105 active:scale-95"
                    style={{
                      backgroundColor: `${action.color}12`,
                      borderColor: `${action.color}30`,
                      color: action.color
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
