import { describe, expect, it } from 'vitest'
import type { Conclusion, ProjectRobustness } from '../api/types'
import { conclusionParagraphs } from './conclusion'

const names = new Map([
  ['a', 'Lamp'],
  ['b', 'Mat'],
  ['c', 'Box'],
  ['q', 'Quality'],
  ['p', 'Price'],
])

const base = (patch: Partial<Conclusion> = {}): Conclusion => ({
  winner: { id: 'a', score: 64 },
  runner_up: { id: 'b', score: 61 },
  score_gap: 3,
  tied: [],
  top_contributions: [
    { criterion_id: 'q', points: 30 },
    { criterion_id: 'p', points: 24 },
  ],
  advantages: [{ criterion_id: 'p', points: 18 }],
  disadvantages: [{ criterion_id: 'q', points: -15 }],
  caveats: [],
  ...patch,
})

const robustness = {
  settings: { mode: 'around', spread: 0.2, samples: 5000, seed: 1 },
  alternatives: [],
  wins: [],
  confidence: { id: 'a', p_best: 0.823, level: 'high' },
} as unknown as ProjectRobustness

const texts = (...args: Parameters<typeof conclusionParagraphs>) => conclusionParagraphs(...args).map((p) => p.text)

describe('conclusion text', () => {
  it('writes recommendation, reasons, comparison and confidence in Chinese', () => {
    expect(texts('zh', base(), names, robustness)).toEqual([
      '推荐 Lamp：加权得分 64.0 分（满分 100），比第二名 Mat 高 3.0 分。',
      'Lamp 的得分主要来自：Quality（30.0 分）、Price（24.0 分）。',
      '和 Mat 相比，Lamp 的优势在 Price（18.0 分）；劣势在 Quality（15.0 分）。',
      '可靠程度：高。在当前权重附近抽样的 5,000 次模拟中，Lamp 有 82.3% 的情况排第一。',
    ])
  })

  it('writes the same points in English', () => {
    expect(texts('en', base(), names, robustness)).toEqual([
      'Recommended: Lamp, with a weighted score of 64.0 out of 100, 3.0 points ahead of the runner-up Mat.',
      "Lamp's score comes mainly from Quality (30.0 pts), Price (24.0 pts).",
      'Compared with Mat, Lamp is better on Price (18.0 pts) and worse on Quality (15.0 pts).',
      'Confidence: High. In 5,000 simulations sampling around the current weights, Lamp came first in 82.3% of cases.',
    ])
  })

  it('is deterministic', () => {
    expect(texts('zh', base(), names, robustness)).toEqual(texts('zh', base(), names, robustness))
  })

  it('says when the gap is small, when nothing is worse and leaves out confidence until it is known', () => {
    const result = texts('zh', base({ score_gap: 0.4, disadvantages: [] }), names, null)
    expect(result[0]).toContain('两者差距很小')
    expect(result[2]).toBe('和 Mat 相比，Lamp 的优势在 Price（18.0 分），没有哪一项比 Mat 差。')
    expect(result).toHaveLength(3)
  })

  it('handles ties and caveats', () => {
    const tied = base({
      tied: ['b'],
      score_gap: 0,
      advantages: [],
      caveats: [{ code: 'caveat_tied_first', params: { alternatives: 'Lamp, Mat' }, message: '' }],
    })
    const paragraphs = conclusionParagraphs('en', tied, names, null)
    expect(paragraphs.map((p) => p.kind)).toEqual(['recommendation', 'reasons', 'caveat'])
    expect(paragraphs[0].text).toBe('Lamp and Mat are tied for first place with a weighted score of 64.0.')
    expect(paragraphs[2].text).toBe('Note: Lamp, Mat are tied for first place.')
  })
})
