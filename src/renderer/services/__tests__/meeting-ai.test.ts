import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MeetingSegment as MeetingSegmentDTO } from '../../models/meeting'

const processText = vi.fn()
let maxInputChars = 120_000
vi.mock('../ai-router', () => ({
  processText: (...args: unknown[]) => processText(...args),
  getMaxInputChars: async () => maxInputChars
}))

const { transcriptToText, formatTimestamp, generateMeetingSummary, recapRecent, askMeeting } =
  await import('../meeting-ai')

function seg(source: 'you' | 'others', startMs: number, text: string): MeetingSegmentDTO {
  return { id: `${source}-${startMs}`, meetingId: 'm1', source, startMs, endMs: startMs + 5000, text }
}

beforeEach(() => {
  processText.mockReset()
  maxInputChars = 120_000
})

describe('formatTimestamp', () => {
  it('formats minutes and hours', () => {
    expect(formatTimestamp(0)).toBe('0:00')
    expect(formatTimestamp(65_000)).toBe('1:05')
    expect(formatTimestamp(3_725_000)).toBe('1:02:05')
  })
})

describe('transcriptToText', () => {
  it('orders by time, merges consecutive turns and uses speaker names', () => {
    const text = transcriptToText(
      [seg('others', 10_000, 'And the budget?'), seg('you', 0, 'Hi all.'), seg('you', 4000, 'Lets start.')],
      { others: 'Client' }
    )
    expect(text).toBe('[0:00] You: Hi all. Lets start.\n[0:10] Client: And the budget?')
  })
})

describe('generateMeetingSummary', () => {
  it('parses the title line and returns the markdown summary', async () => {
    processText.mockResolvedValue({
      result: 'TITLE: Q3 launch sync\n\nWe agreed the launch date.\n\n## Next steps\n- [ ] Sara: send deck',
      provider: 'x',
      model: 'y'
    })
    const out = await generateMeetingSummary({ segments: [seg('you', 0, 'Launch is on the 3rd')] })
    expect(out.title).toBe('Q3 launch sync')
    expect(out.summary.startsWith('We agreed')).toBe(true)
    expect(out.summary).toContain('## Next steps')
  })

  it('summarizes very long meetings in parts first', async () => {
    processText.mockResolvedValue({ result: 'TITLE: Long\n\nok', provider: 'x', model: 'y' })
    const long = Array.from({ length: 1500 }, (_, i) =>
      seg(i % 2 ? 'you' : 'others', i * 5000, 'word '.repeat(20))
    )
    await generateMeetingSummary({ segments: long })
    // At least two map calls plus the final reduce
    expect(processText.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('keeps every request within a small local model context', async () => {
    maxInputChars = 2000
    processText.mockResolvedValue({ result: 'note '.repeat(60), provider: 'local', model: 'm' })
    const long = Array.from({ length: 200 }, (_, i) =>
      seg(i % 2 ? 'you' : 'others', i * 5000, 'word '.repeat(20))
    )
    await generateMeetingSummary({ segments: long })
    const texts = processText.mock.calls.map((c) => (c[0] as { text: string }).text)
    // Notes from the first round were long again, so they were condensed once more
    expect(texts.length).toBeGreaterThan(12)
    for (const text of texts) expect(text.length).toBeLessThanOrEqual(2100)
  })

  it('splits one long monologue so each part fits the model', async () => {
    maxInputChars = 2000
    processText.mockResolvedValue({ result: 'note', provider: 'local', model: 'm' })
    const monologue = Array.from({ length: 100 }, (_, i) =>
      seg('you', i * 5000, 'word '.repeat(20))
    )
    await generateMeetingSummary({ segments: monologue })
    const texts = processText.mock.calls.map((c) => (c[0] as { text: string }).text)
    expect(texts.length).toBeGreaterThan(2)
    for (const text of texts) expect(text.length).toBeLessThanOrEqual(2100)
  })

  it('cuts notes that never get short enough instead of sending too much', async () => {
    maxInputChars = 2000
    processText.mockResolvedValue({ result: 'note '.repeat(400), provider: 'local', model: 'm' })
    const long = Array.from({ length: 200 }, (_, i) =>
      seg(i % 2 ? 'you' : 'others', i * 5000, 'word '.repeat(20))
    )
    await generateMeetingSummary({ segments: long })
    const final = processText.mock.calls.at(-1)![0] as { text: string }
    expect(final.text.length).toBeLessThanOrEqual(2100)
  })

  it('rejects an empty meeting', async () => {
    await expect(generateMeetingSummary({ segments: [] })).rejects.toThrow('empty-meeting')
  })
})

describe('recapRecent', () => {
  it('only sends the last minutes of transcript', async () => {
    processText.mockResolvedValue({ result: '- point', provider: 'x', model: 'y' })
    await recapRecent(
      { segments: [seg('others', 0, 'old stuff'), seg('others', 20 * 60_000, 'recent stuff')] },
      5
    )
    const sent = processText.mock.calls[0][0].text as string
    expect(sent).toContain('recent stuff')
    expect(sent).not.toContain('old stuff')
  })
})

describe('askMeeting', () => {
  it('never sends more than the model can read, even with long notes', async () => {
    maxInputChars = 5000
    processText.mockResolvedValue({ result: 'answer', provider: 'local', model: 'm' })
    const long = Array.from({ length: 300 }, (_, i) => seg('others', i * 5000, `line ${i} here`))
    await askMeeting('Q?', { segments: long, summary: 's'.repeat(8000), notes: 'n'.repeat(7000) })
    const sent = processText.mock.calls[0][0].text as string
    expect(sent.length).toBeLessThanOrEqual(5000)
  })

  it('leaves room for the question and earlier answers', async () => {
    maxInputChars = 5000
    processText.mockResolvedValue({ result: 'answer', provider: 'local', model: 'm' })
    const long = Array.from({ length: 300 }, (_, i) => seg('others', i * 5000, `line ${i} here`))
    const history = Array.from({ length: 6 }, (_, i) => ({
      role: i % 2 ? ('assistant' as const) : ('user' as const),
      content: 'x'.repeat(2000)
    }))
    await askMeeting('Q?'.repeat(200), { segments: long }, history)
    const { prompt, text } = processText.mock.calls[0][0] as { prompt: string; text: string }
    expect(prompt.length + text.length).toBeLessThanOrEqual(5000)
  })

  it('sends only the most recent transcript that fits the model', async () => {
    maxInputChars = 5000
    processText.mockResolvedValue({ result: 'answer', provider: 'local', model: 'm' })
    const long = Array.from({ length: 300 }, (_, i) => seg('others', i * 5000, `line ${i} here`))
    await askMeeting('What was said last?', { segments: long })
    const sent = processText.mock.calls[0][0].text as string
    expect(sent.length).toBeLessThanOrEqual(5000)
    expect(sent).toContain('line 299 here')
    expect(sent).not.toContain('line 0 here')
  })
})
