import type { AIRequest, AIResponse } from './ai-router'

const DEFAULT_MODEL = 'gpt-4.1'
const API_BASE = 'https://api.openai.com/v1'

interface OpenAIResponse {
  choices: {
    message: { content: string }
  }[]
  usage?: {
    total_tokens: number
  }
}

export async function processWithOpenAI(
  request: AIRequest,
  apiKey: string,
  model?: string
): Promise<AIResponse> {
  const modelId = model || DEFAULT_MODEL

  const messages = [
    ...(request.systemInstruction
      ? [{ role: 'system', content: request.systemInstruction }]
      : []),
    {
      role: 'user',
      content: `${request.prompt}\n\nText: ${request.text}`
    }
  ]

  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      temperature: 0.7,
      max_tokens: 2048
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${response.status} - ${error}`)
  }

  const data: OpenAIResponse = await response.json()
  const result = data.choices?.[0]?.message?.content || ''

  return {
    result: result.trim(),
    provider: 'openai',
    model: modelId,
    tokensUsed: data.usage?.total_tokens
  }
}
