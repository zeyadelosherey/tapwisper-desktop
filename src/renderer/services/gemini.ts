import type { AIRequest, AIResponse } from './ai-router'

const DEFAULT_MODEL = 'gemini-2.5-flash'
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

interface GeminiResponse {
  candidates: {
    content: {
      parts: { text?: string; thought?: boolean }[]
    }
  }[]
  usageMetadata?: {
    totalTokenCount: number
  }
}

export async function processWithGemini(
  request: AIRequest,
  apiKey: string,
  model?: string
): Promise<AIResponse> {
  const modelId = model || DEFAULT_MODEL
  const url = `${API_BASE}/models/${modelId}:generateContent?key=${apiKey}`

  const body = {
    contents: [
      {
        parts: [
          {
            text: request.systemInstruction
              ? `${request.systemInstruction}\n\n${request.prompt}\n\nText: ${request.text}`
              : `${request.prompt}\n\nText: ${request.text}`
          }
        ]
      }
    ],
    generationConfig: {
      temperature: request.temperature ?? 0.7,
      maxOutputTokens: request.maxTokens ?? 2048,
      // 2.5 Flash "thinks" by default; thinking tokens count against
      // maxOutputTokens (truncating long answers) and add seconds of latency.
      // TapWisper's tasks are rewriting/summarizing, which don't need it.
      ...(/flash/i.test(modelId) && /2\.5/.test(modelId)
        ? { thinkingConfig: { thinkingBudget: 0 } }
        : {})
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gemini API error: ${response.status} - ${error}`)
  }

  const data: GeminiResponse = await response.json()
  // Join every non-thought part — long answers can be split across parts
  const result = (data.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')

  return {
    result: result.trim(),
    provider: 'gemini',
    model: modelId,
    tokensUsed: data.usageMetadata?.totalTokenCount
  }
}
