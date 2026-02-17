import { useState, useCallback } from 'react'
import { processText, type AIResponse } from '../services/ai-router'
import { useStatsStore } from '../store/stats'
import { useActivityStore } from '../store/activity'

interface UseAIActionReturn {
  isProcessing: boolean
  result: AIResponse | null
  error: string | null
  execute: (prompt: string, text: string, category?: string) => Promise<AIResponse | null>
  reset: () => void
}

/**
 * Hook for executing AI actions with loading and error state
 */
export function useAIAction(): UseAIActionReturn {
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<AIResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const addAIAction = useStatsStore((s) => s.addAIAction)
  const addLLMAction = useActivityStore((s) => s.addLLMAction)

  const execute = useCallback(
    async (prompt: string, text: string, category?: string): Promise<AIResponse | null> => {
      setIsProcessing(true)
      setError(null)
      setResult(null)

      try {
        const response = await processText({ prompt, text })
        setResult(response)
        setIsProcessing(false)

        // Track AI action analytics
        addAIAction(category || 'general', response.result?.length || 0)

        // Track full activity record
        const prettyCategory = (category || 'general').replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
        addLLMAction({
          llmAction: prettyCategory,
          llmInput: text,
          llmResult: response.result || ''
        })

        return response
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred'
        setError(message)
        setIsProcessing(false)
        return null
      }
    },
    [addAIAction, addLLMAction]
  )

  const reset = useCallback(() => {
    setIsProcessing(false)
    setResult(null)
    setError(null)
  }, [])

  return {
    isProcessing,
    result,
    error,
    execute,
    reset
  }
}
