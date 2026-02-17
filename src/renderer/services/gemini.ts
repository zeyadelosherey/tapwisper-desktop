import type { AIRequest, AIResponse } from './ai-router'

const DEFAULT_MODEL = 'gemini-2.5-flash'
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

interface GeminiResponse {
  candidates: {
    content: {
      parts: { text: string }[]
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
      temperature: 0.7,
      maxOutputTokens: 2048
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
  const result = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

  return {
    result: result.trim(),
    provider: 'gemini',
    model: modelId,
    tokensUsed: data.usageMetadata?.totalTokenCount
  }
}
