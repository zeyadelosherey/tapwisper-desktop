import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MeetingSegment as MeetingSegmentDTO } from '../../models/meeting'

const processText = vi.fn()
vi.mock('../ai-router', () => ({ processText: (...args: unknown[]) => processText(...args) }))

const { transcriptToText, formatTimestamp, generateMeetingSummary, recapRecent } = await import(
  '../meeting-ai'
)

function seg(source: 'you' | 'others', startMs: number, text: string): MeetingSegmentDTO {
  return { id: `${source}-${startMs}`, meetingId: 'm1', source, startMs, endMs: startMs + 5000, text }
}

beforeEach(() => {
  processText.mockReset()
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
