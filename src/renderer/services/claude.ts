import type { AIRequest, AIResponse } from './ai-router'

const DEFAULT_MODEL = 'claude-sonnet-4-5'
const API_BASE = 'https://api.anthropic.com/v1'

interface ClaudeResponse {
  content: { text: string }[]
  usage?: {
    input_tokens: number
    output_tokens: number
  }
}

export async function processWithClaude(
  request: AIRequest,
  apiKey: string,
  model?: string
): Promise<AIResponse> {
  const modelId = model || DEFAULT_MODEL

  const response = await fetch(`${API_BASE}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 2048,
      ...(request.systemInstruction && { system: request.systemInstruction }),
      messages: [
        {
          role: 'user',
          content: `${request.prompt}\n\nText: ${request.text}`
        }
      ]
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Claude API error: ${response.status} - ${error}`)
  }

  const data: ClaudeResponse = await response.json()
  const result = data.content?.[0]?.text || ''

  return {
    result: result.trim(),
    provider: 'claude',
    model: modelId,
    tokensUsed: data.usage
      ? data.usage.input_tokens + data.usage.output_tokens
      : undefined
  }
}
