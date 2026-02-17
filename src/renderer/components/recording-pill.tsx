import { useEffect, useState, useRef, useCallback } from 'react'
import { WaveformBars } from './waveform-bars'
import { processText } from '../services/ai-router'
import {
  BUILT_IN_CATEGORIES,
  type ActionCategory as StoredCategory
} from '../models/actions-config'
import { useStatsStore } from '../store/stats'
import { useActivityStore } from '../store/activity'

type PillState = 'hidden' | 'recording' | 'transcribing' | 'loading-ai' | 'result' | 'error' | 'done'

interface ResultEntry {
  id: string
  actionName: string
  text: string
}

import { CATEGORY_COLORS } from '../constants/colors'

export function RecordingPill(): JSX.Element {
  const [state, setState] = useState<PillState>('hidden')
  const [waveformData, setWaveformData] = useState<number[]>([0, 0, 0, 0, 0, 0, 0])
  const [resultText, setResultText] = useState('')
  const [actionLabel, setActionLabel] = useState('')
  const [errorText, setErrorText] = useState('')
  const [copied, setCopied] = useState(false)
  const animationRef = useRef<number | null>(null)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Actions & history
  const [showActions, setShowActions] = useState(false)
  const [categories, setCategories] = useState<StoredCategory[]>(BUILT_IN_CATEGORIES)
  const [resultHistory, setResultHistory] = useState<ResultEntry[]>([])
  const [isFullExpanded, setIsFullExpanded] = useState(false)

  const addAIAction = useStatsStore((s) => s.addAIAction)
  const addLLMAction = useActivityStore((s) => s.addLLMAction)

  // Load user-configured actions (reload whenever result panel becomes visible)
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

  const resetAll = useCallback(() => {
    setResultText('')
    setActionLabel('')
    setErrorText('')
    setCopied(false)
    setShowActions(false)
    setResultHistory([])
    setIsFullExpanded(false)
  }, [])

  const dismiss = useCallback(() => {
    setState('done')
    if (isFullExpanded) {
      setIsFullExpanded(false)
    }
    resetAll()
    window.tapwisper.recordingPill.collapse()
    setTimeout(() => {
      setState('hidden')
      window.tapwisper.recordingPill.hide()
    }, 250)
  }, [resetAll, isFullExpanded])

  const handleAccept = useCallback(async () => {
    if (!resultText) return
    await window.tapwisper.clipboard.insertText(resultText)
    dismiss()
  }, [resultText, dismiss])

  const handleCopy = useCallback(() => {
    if (!resultText) return
    window.tapwisper.clipboard.write(resultText)
    setCopied(true)
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
  }, [resultText])

  // Run a follow-up action on the current result text
  const handleRunAction = useCallback(async (actionId: string, prompt: string, label: string) => {
    if (state === 'loading-ai' || !resultText) return

    // Save current result to history
    setResultHistory((prev) => [{
      id: `${Date.now()}`,
      actionName: actionLabel || 'Voice Command',
      text: resultText
    }, ...prev])

    setActionLabel(label)
    setState('loading-ai')
    setShowActions(false)

    try {
      const response = await processText({ prompt, text: resultText })
      const newText = response.result || resultText
      setResultText(newText)
      setState('result')

      addAIAction(actionId, newText.length)
      addLLMAction({
        llmAction: label,
        llmInput: resultText,
        llmResult: newText
      })
    } catch (err: any) {
      console.error('Follow-up action failed:', err)
      setState('result')
    }
  }, [state, resultText, actionLabel, addAIAction, addLLMAction])

  // Revert to a previous version
  const handleRevert = useCallback((index: number) => {
    const target = resultHistory[index]
    if (!target) return
    setResultText(target.text)
    setActionLabel(target.actionName)
    setResultHistory((prev) => prev.slice(index + 1))
  }, [resultHistory])

  const handleToggleFullExpand = useCallback(() => {
    const next = !isFullExpanded
    setIsFullExpanded(next)
    if (next) {
      window.tapwisper.recordingPill.expandFull()
    } else {
      window.tapwisper.recordingPill.collapseToResults()
    }
  }, [isFullExpanded])

  useEffect(() => {
    document.documentElement.classList.add('transparent')

    const unsubShow = window.tapwisper.on('recording-pill:show', () => {
      setState('recording')
    })

    const unsubHide = window.tapwisper.on('recording-pill:hide', () => {
      setState('done')
      resetAll()
      setTimeout(() => setState('hidden'), 250)
    })

    const unsubStart = window.tapwisper.on('recording:start', () => {
      setState('recording')
    })

    const unsubStop = window.tapwisper.on('recording:stop', () => {
      setState('transcribing')
    })

    const unsubCancel = window.tapwisper.on('recording:cancel', () => {
      setState('done')
      resetAll()
      setTimeout(() => setState('hidden'), 250)
    })

    const unsubWaveform = window.tapwisper.on('waveform:data', (data: unknown) => {
      if (Array.isArray(data)) {
        setWaveformData(data as number[])
      }
    })

    const unsubLoading = window.tapwisper.on('result-panel:loading', (data: unknown) => {
      if (data && typeof data === 'object' && 'action' in data) {
        setActionLabel((data as { action: string }).action)
      } else {
        setActionLabel('Voice Command')
      }
      setState('loading-ai')
      window.tapwisper.recordingPill.expand()
    })

    const unsubResult = window.tapwisper.on('result-panel:result', (data: unknown) => {
      if (typeof data === 'string') {
        setResultText(data)
        setState('result')
      } else if (data && typeof data === 'object') {
        const { text, action } = data as { text?: string; action?: string }
        if (text) setResultText(text)
        if (action) setActionLabel(action)
        setState('result')
      }
    })

    const unsubError = window.tapwisper.on('result-panel:error', (msg: unknown) => {
      if (typeof msg === 'string') {
        setErrorText(msg)
        setState('error')
      }
    })

    return () => {
      unsubShow()
      unsubHide()
      unsubStart()
      unsubStop()
      unsubCancel()
      unsubWaveform()
      unsubLoading()
      unsubResult()
      unsubError()
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [resetAll])

  useEffect(() => {
    if (state === 'transcribing' || state === 'loading-ai') {
      setWaveformData([0.4, 0.5, 0.6, 0.7, 0.6, 0.5, 0.4])
    } else if (state !== 'recording') {
      setWaveformData([0, 0, 0, 0, 0, 0, 0])
    }
  }, [state])

  if (state === 'hidden') return <></>

  const isExiting = state === 'done'
  const showResultPanel = state === 'loading-ai' || state === 'result' || state === 'error'

  // Flatten all actions from all visible categories into a single list
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

  return (
    <div className="w-full flex flex-col items-center no-select overflow-hidden" style={{ height: '100vh' }}>
      {/* ── Top pill bar ── */}
      <div
        className={`
          shrink-0 flex items-center justify-center gap-3 px-4 py-1.5
          bg-[#0A0A0A]/95 rounded-full pill-shadow
          transition-all duration-300 ease-out
          ${isExiting ? 'opacity-0 scale-75' : 'opacity-100 scale-100 animate-scale-up'}
        `}
        style={{ height: 44 }}
      >
        {state === 'loading-ai' ? (
          <div className="flex items-center gap-2.5 px-1">
            <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
            <span className="text-[11px] text-white/60 font-medium">Processing...</span>
          </div>
        ) : (state === 'result' || state === 'error') ? (
          <div className="flex items-center gap-2 px-1">
            {state === 'result' ? (
              <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />
              </svg>
            )}
            <span className="text-[12px] text-white/70 font-medium">
              {state === 'result' ? 'Done' : 'Error'}
            </span>
          </div>
        ) : (
          <WaveformBars
            data={waveformData}
            barCount={7}
            barWidth={3}
            maxHeight={22}
            color={state === 'transcribing' ? 'rgba(255,255,255,0.4)' : '#FFFFFF'}
            animated={state === 'recording'}
            settled={state === 'transcribing'}
          />
        )}
      </div>

      {/* ── Result Panel (slides in below pill) ── */}
      {showResultPanel && (
        <div
          className={`
            mt-2 bg-[#0A0A0A]/95 rounded-2xl pill-shadow
            transition-all duration-300 ease-out
            animate-slide-down overflow-hidden flex flex-col
            ${isFullExpanded ? 'w-full max-w-[500px]' : 'w-[380px]'}
          `}
          style={isFullExpanded ? { flex: '1 1 0%', minHeight: 0 } : undefined}
        >
          {/* ── Top bar: action badge + expand toggle (fixed top) ── */}
          {(state === 'result' || state === 'error') && (
            <div className="flex items-center justify-between px-4 pt-3 pb-0 shrink-0">
              {/* Action badge */}
              {state === 'result' && actionLabel ? (
                <div className="flex items-center gap-1.5">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/8 border border-white/10">
                    <svg className="w-3 h-3 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span className="text-[11px] font-medium text-white/60">{actionLabel}</span>
                  </div>
                  {resultHistory.length > 0 && (
                    <span className="text-[10px] text-white/30">latest</span>
                  )}
                </div>
              ) : <div />}
              {/* Expand / Collapse toggle */}
              <button
                onClick={handleToggleFullExpand}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-white/40 hover:text-white/80 transition-all cursor-pointer shrink-0"
                title={isFullExpanded ? 'Collapse' : 'Expand to read'}
              >
                {isFullExpanded ? (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 14h6m0 0v6m0-6L3 21M20 10h-6m0 0V4m0 6l7-7" />
                    </svg>
                    <span className="text-[10px] font-medium">Collapse</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 3h6m0 0v6m0-6l-7 7M9 21H3m0 0v-6m0 6l7-7" />
                    </svg>
                    <span className="text-[10px] font-medium">Expand</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* ── Scrollable content area (middle, grows to fill) ── */}
          <div
            className="overflow-y-auto custom-scrollbar p-4 pt-2"
            style={isFullExpanded ? { flex: '1 1 0%', minHeight: 0 } : undefined}
          >
            {state === 'loading-ai' && (
              <div className="flex flex-col items-center justify-center py-6 gap-3">
                {actionLabel && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/8 border border-white/10">
                    <svg className="w-3 h-3 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span className="text-[11px] font-medium text-white/60">{actionLabel}</span>
                  </div>
                )}
                <div className="w-6 h-6 rounded-full border-2 border-white/15 border-t-white/70 animate-spin" />
                <p className="text-xs text-white/40">Thinking...</p>
              </div>
            )}

            {state === 'result' && (
              <div className="space-y-2.5">
                {/* Result text */}
                <div className={`${isFullExpanded ? '' : 'max-h-[120px] overflow-y-auto custom-scrollbar'}`}>
                  <p className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap">{resultText}</p>
                </div>

                {/* Previous versions */}
                {resultHistory.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 border-t border-white/10" />
                      <span className="text-[9px] text-white/25 uppercase tracking-wider">Previous</span>
                      <div className="flex-1 border-t border-white/10" />
                    </div>
                    {resultHistory.map((entry, idx) => (
                      <div key={entry.id} className="group">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[10px] text-white/30">{entry.actionName}</span>
                          <button
                            onClick={() => handleRevert(idx)}
                            className="opacity-0 group-hover:opacity-100 text-[10px] text-sky-400 hover:text-sky-300 transition-all"
                          >
                            Revert
                          </button>
                        </div>
                        <p className="text-xs text-white/40 leading-relaxed line-clamp-2">{entry.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {state === 'error' && (
              <div className="py-2">
                <p className="text-xs text-red-400/90 leading-relaxed">{errorText}</p>
              </div>
            )}
          </div>

          {/* ── Fixed bottom: Actions bar + buttons (never scrolls) ── */}
          {(state === 'result' || state === 'error') && (
            <div className="shrink-0 border-t border-white/10">
              {/* Apply another action / Actions list */}
              {state === 'result' && (
                <div className="px-4 pt-3">
                  {!showActions ? (
                    <button
                      onClick={() => setShowActions(true)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/8 text-white/50 hover:text-white/70 transition-all cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span className="text-[11px] font-medium">Apply another action</span>
                    </button>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Actions</span>
                        <button
                          onClick={() => setShowActions(false)}
                          className="text-white/30 hover:text-white/60 transition-all cursor-pointer"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto custom-scrollbar">
                        {flatActions.map((action) => (
                          <button
                            key={action.id}
                            onClick={() => handleRunAction(action.id, action.prompt, action.label)}
                            className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer border"
                            style={{
                              backgroundColor: `${action.color}15`,
                              borderColor: `${action.color}30`,
                              color: action.color
                            }}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Confirm / Copy / Close buttons */}
              <div className="flex items-center gap-2 px-4 py-3">
                {state === 'result' && (
                  <>
                    <button
                      onClick={handleAccept}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-full bg-white/90 hover:bg-white text-black text-xs font-semibold transition-all cursor-pointer"
                    >
                      Confirm
                    </button>

                    <button
                      onClick={handleCopy}
                      className="flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-full bg-white/10 hover:bg-white/20 text-white/80 text-xs font-medium transition-all cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          Copied
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Copy
                        </>
                      )}
                    </button>
                  </>
                )}

                <button
                  onClick={dismiss}
                  className="flex items-center justify-center w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white/50 hover:text-white/80 transition-all cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
