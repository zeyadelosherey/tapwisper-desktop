import { describe, it, expect } from 'vitest'
import { containment } from '../text-similarity'

describe('containment', () => {
  it('detects mic text that is contained in the meeting audio (speaker bleed)', () => {
    const others = 'So the plan is to ship on Thursday and then review the numbers on Monday.'
    expect(containment('ship on thursday and then review', others)).toBeGreaterThan(0.9)
  })

  it('keeps genuinely different speech apart', () => {
    expect(
      containment('I disagree, Friday is too late for us', 'Ship on Thursday then review')
    ).toBeLessThan(0.5)
  })

  it('works for Arabic', () => {
    expect(containment('نرسل التقرير بكرة', 'تمام نرسل التقرير بكرة الصبح')).toBeGreaterThan(0.9)
  })
})
