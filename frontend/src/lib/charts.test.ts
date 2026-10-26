import { describe, expect, it } from 'vitest'
import type { Interval, MethodResult, ProjectRobustness } from '../api/types'
import {
  breakdownChart,
  curveChart,
  intervalRows,
  rankChart,
  rankDistributionChart,
  scoreChart,
  winsChart,
} from './charts'

const interval = (
  criterion: string,
  weight: number,
  lower: number,
  upper: number | null,
  lowerShare: number,
  upperShare: number,
): Interval => ({
  criterion,
  criterion_id: criterion,
  weight,
  lower,
  upper,
  lower_share: lowerShare,
  upper_share: upperShare,
})

describe('intervalRows', () => {
  const intervals = [
    interval('wide', 0.5, 0, null, 0, 1),
    interval('narrow', 0.3, 0.25, 0.35, 0.2, 0.4),
    interval('tie', 0.2, 0.2, 0.2, 0.2, 0.2),
    interval('unused', 0, 0, 1, 0, 0.5),
  ]

  it('sorts by width and adds the current share', () => {
    const rows = intervalRows(intervals, false)
    expect(rows.map((r) => r.criterion)).toEqual(['tie', 'narrow', 'wide'])
    expect(rows[1].share).toBeCloseTo(0.3)
    expect(rows[0].collapsed).toBe(true)
    expect(rows[2].collapsed).toBe(false)
  })

  it('can include zero-weight criteria', () => {
    expect(intervalRows(intervals, true)).toHaveLength(4)
  })
})

const result = (method: string, ranks: number[], contributions?: Record<string, number>[]): MethodResult => ({
  method,
  label: method,
  spec: { method: 'weighted_sum' },
  higher_is_better: true,
  alternatives: ranks.map((rank, i) => ({
    id: `a${i}`,
    name: `A${i}`,
    score: 1 / rank,
    rank,
    contributions: contributions?.[i] ?? null,
  })),
  order: ranks.map((_, i) => `A${i}`).sort((a, b) => ranks[Number(a.slice(1))] - ranks[Number(b.slice(1))]),
})

describe('chart options', () => {
  it('puts the best alternative on top of the score chart', () => {
    const option = scoreChart(result('ws', [2, 1, 3])) as { yAxis: { data: string[] } }
    expect(option.yAxis.data).toEqual(['A2', 'A0', 'A1'])
  })

  it('draws one rank line per alternative', () => {
    const option = rankChart([result('ws', [2, 1]), result('topsis', [1, 2])], ['WS', 'TOPSIS']) as {
      series: { data: number[] }[]
      xAxis: { data: string[] }
    }
    expect(option.xAxis.data).toEqual(['WS', 'TOPSIS'])
    expect(option.series.map((s) => s.data)).toEqual([
      [2, 1],
      [1, 2],
    ])
  })

  it('skips criteria that contribute nothing', () => {
    const option = breakdownChart(
      result(
        'ws',
        [1, 2],
        [
          { c0: 0.5, c1: 0, c2: 0.1 },
          { c0: 0.2, c1: 0, c2: 0.3 },
        ],
      ),
      [
        { id: 'c0', name: 'Price' },
        { id: 'c1', name: 'Unused' },
        { id: 'c2', name: 'Quality' },
      ],
    ) as { series: { name: string }[] }
    expect(option.series.map((s) => s.name)).toEqual(['Price', 'Quality'])
  })
})

describe('breakdown scale', () => {
  it('shows contributions as points of the 0–100 score', () => {
    const option = breakdownChart(result('ws', [1, 2], [{ c0: 0.25 }, { c0: 0.5 }]), [{ id: 'c0', name: 'Price' }]) as {
      series: { data: number[] }[]
    }
    expect(option.series[0].data).toEqual([50, 25])
  })
})

describe('curve chart', () => {
  it('draws the curve, scored alternatives and excluded ones', () => {
    const option = curveChart(
      {
        criterion_id: 'c1',
        low: 0,
        high: 10,
        points: [
          [0, 0],
          [10, 1],
        ],
        alternatives: [
          { id: 'a1', x: 4, value: 0.4 },
          { id: 'a2', x: 8, value: null },
        ],
      },
      { a1: 'Mat', a2: 'Box' },
      { excluded: 'excluded' },
    ) as { series: { data: { name?: string; value: number[] }[] }[] }
    expect(option.series[0].data.map((d) => d.value)).toEqual([
      [0, 0],
      [10, 1],
    ])
    expect(option.series[1].data).toEqual([{ name: 'Mat', value: [4, 0.4] }])
    expect(option.series[2].data).toEqual([{ name: 'Box', value: [8, 0] }])
  })
})

describe('robustness charts', () => {
  const alternative = (id: string, probabilities: number[]) => ({
    id,
    name: id.toUpperCase(),
    rank_probabilities: probabilities,
    p_best: probabilities[0],
    mean_rank: probabilities.reduce((sum, p, r) => sum + p * (r + 1), 0),
  })
  const names = ['a', 'b', 'c', 'd', 'e', 'f']
  const robustness = {
    settings: { mode: 'around', spread: 0.2, samples: 100, seed: 1 },
    alternatives: names.map((id, i) =>
      alternative(
        id,
        names.map((_, r) => (r === i ? 1 : 0)),
      ),
    ),
    wins: names.map((_, i) => names.map((__, j) => (i < j ? 1 : 0))),
    confidence: { id: 'a', p_best: 1, level: 'high' },
  } as ProjectRobustness

  it('stacks the first five ranks and combines the rest, best alternative on top', () => {
    const option = rankDistributionChart(robustness, { rank: (r) => `#${r}`, rest: (r) => `#${r}+` }) as {
      yAxis: { data: string[] }
      series: { name: string; data: number[] }[]
    }
    expect(option.series.map((s) => s.name)).toEqual(['#1', '#2', '#3', '#4', '#5', '#6+'])
    expect(option.yAxis.data.at(-1)).toBe('A')
    expect(option.series[0].data.at(-1)).toBe(100)
    expect(option.series[5].data[0]).toBe(100) // F is always last
  })

  it('limits the heatmap and leaves the diagonal empty', () => {
    const option = winsChart(robustness, 3, 'beats') as {
      xAxis: { data: string[] }
      series: { data: [number, number, number | string][] }[]
    }
    expect(option.xAxis.data).toEqual(['A', 'B', 'C'])
    expect(option.series[0].data).toContainEqual([1, 0, 100]) // A beats B
    expect(option.series[0].data).toContainEqual([0, 0, '-'])
  })
})
