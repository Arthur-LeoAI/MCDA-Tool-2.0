// ECharts option builders (pure functions of API results).
import type { EChartsCoreOption } from 'echarts'
import type { Interval, MethodResult, ProjectRobustness, ValueCurve } from '../api/types'
import { colorAt, formatPercent, formatScore } from './format'

const AXIS_LABEL = { color: '#64748b', fontSize: 11 }
const SPLIT_LINE = { lineStyle: { color: '#e2e8f0' } }
const TOOLTIP = {
  confine: true,
  backgroundColor: '#fff',
  borderColor: '#e2e8f0',
  textStyle: { color: '#334155', fontSize: 12 },
}

const truncate = (text: string, length = 22) => (text.length > length ? `${text.slice(0, length - 1)}…` : text)

/** Horizontal bars, best on top; `scale` multiplies the scores for display (e.g. 100). */
export function scoreChart(result: MethodResult, scale = 1, color = '#4f46e5'): EChartsCoreOption {
  const rows = [...result.alternatives].sort((a, b) => b.rank - a.rank)
  return {
    grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
    tooltip: { ...TOOLTIP, trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'value', axisLabel: AXIS_LABEL, splitLine: SPLIT_LINE },
    yAxis: {
      type: 'category',
      data: rows.map((r) => r.name),
      axisLabel: { ...AXIS_LABEL, formatter: (v: string) => truncate(v) },
    },
    series: [
      {
        type: 'bar',
        data: rows.map((r) => ({
          value: r.score * scale,
          itemStyle: { color: r.rank === 1 ? color : `${color}99`, borderRadius: [0, 4, 4, 0] },
        })),
        label: {
          show: true,
          position: 'right',
          fontSize: 11,
          color: '#475569',
          formatter: ({ value }: { value: number }) => (scale === 100 ? value.toFixed(1) : formatScore(value)),
        },
        barMaxWidth: 22,
      },
    ],
  }
}

/** One line per alternative across methods; rank 1 at the top. */
export function rankChart(results: MethodResult[], labels: string[]): EChartsCoreOption {
  const names = results[0]?.alternatives.map((a) => a.name) ?? []
  const n = names.length
  return {
    grid: { left: 8, right: 150, top: 16, bottom: 8, containLabel: true },
    tooltip: { ...TOOLTIP, trigger: 'item' },
    xAxis: {
      type: 'category',
      data: labels,
      // Always show every method; wrap long labels instead of hiding them.
      axisLabel: { ...AXIS_LABEL, interval: 0, width: 90, overflow: 'break' },
      // Points sit in the middle of their band, so edge labels are not clipped.
      boundaryGap: true,
    },
    yAxis: {
      type: 'value',
      inverse: true,
      min: 1,
      max: Math.max(n, 2),
      interval: 1,
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
    },
    series: names.map((name, i) => ({
      name,
      type: 'line',
      data: results.map((r) => r.alternatives[i].rank),
      symbolSize: 9,
      lineStyle: { width: 2.5 },
      color: colorAt(i),
      endLabel: { show: true, formatter: () => truncate(name, 20), color: colorAt(i), fontSize: 11 },
      emphasis: { focus: 'series' },
    })),
  }
}

/** Stacked bars: each criterion's points in the weighted-sum score (0–100 like the score itself). */
export function breakdownChart(result: MethodResult, criteria: { id: string; name: string }[]): EChartsCoreOption {
  const rows = [...result.alternatives].sort((a, b) => b.rank - a.rank)
  const used = criteria.filter(({ id }) => rows.some((r) => (r.contributions?.[id] ?? 0) !== 0))
  return {
    grid: { left: 8, right: 16, top: 40, bottom: 8, containLabel: true },
    legend: { type: 'scroll', top: 0, textStyle: { fontSize: 11, color: '#475569' }, pageIconSize: 10 },
    tooltip: {
      ...TOOLTIP,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v: number) => v.toFixed(1),
    },
    xAxis: { type: 'value', axisLabel: AXIS_LABEL, splitLine: SPLIT_LINE },
    yAxis: {
      type: 'category',
      data: rows.map((r) => r.name),
      axisLabel: { ...AXIS_LABEL, formatter: (v: string) => truncate(v) },
    },
    series: used.map(({ id, name }, k) => ({
      name,
      type: 'bar',
      stack: 'total',
      data: rows.map((r) => (r.contributions?.[id] ?? 0) * 100),
      color: colorAt(k),
      barMaxWidth: 26,
      emphasis: { focus: 'series' },
    })),
  }
}

export interface IntervalRow extends Interval {
  share: number
  width: number
  collapsed: boolean
}

/** Intervals with the current weight share, narrowest (most sensitive) first. */
export function intervalRows(intervals: Interval[], includeZero: boolean): IntervalRow[] {
  const total = intervals.reduce((sum, i) => sum + i.weight, 0)
  return intervals
    .filter((i) => includeZero || i.weight > 0)
    .map((i) => ({
      ...i,
      share: total > 0 ? i.weight / total : 0,
      width: i.upper_share - i.lower_share,
      collapsed: i.upper !== null && i.upper === i.lower,
    }))
    .sort((a, b) => a.width - b.width)
}

/** Range bars (transparent offset + visible span) with a marker at the current share. */
export function stabilityChart(rows: IntervalRow[], labels: { current: string; unbounded: string }): EChartsCoreOption {
  const ordered = [...rows].reverse() // ECharts draws the first category at the bottom
  return {
    grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      ...TOOLTIP,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: { dataIndex: number }[]) => {
        const row = ordered[params[0].dataIndex]
        const upper = row.upper === null ? labels.unbounded : formatPercent(row.upper_share)
        return `<b>${row.criterion}</b><br/>${formatPercent(row.lower_share)} – ${upper}<br/>${labels.current}: ${formatPercent(row.share)}`
      },
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 1,
      axisLabel: { ...AXIS_LABEL, formatter: (v: number) => formatPercent(v, 0) },
      splitLine: SPLIT_LINE,
    },
    yAxis: {
      type: 'category',
      data: ordered.map((r) => r.criterion),
      axisLabel: { ...AXIS_LABEL, formatter: (v: string) => truncate(v, 28) },
    },
    series: [
      {
        type: 'bar',
        stack: 'range',
        silent: true,
        itemStyle: { color: 'transparent' },
        data: ordered.map((r) => r.lower_share),
        barMaxWidth: 16,
      },
      {
        type: 'bar',
        stack: 'range',
        barMaxWidth: 16,
        data: ordered.map((r) => ({
          value: Math.max(r.width, 0.004),
          itemStyle: {
            color: r.collapsed ? '#dc2626' : r.upper === null ? '#a5b4fc' : '#6366f1',
            borderRadius: 3,
          },
        })),
      },
      {
        type: 'scatter',
        data: ordered.map((r) => r.share),
        symbol: 'circle',
        symbolSize: 9,
        itemStyle: { color: '#0f172a', borderColor: '#fff', borderWidth: 1.5 },
        z: 5,
      },
    ],
  }
}

/** A criterion's value function with each alternative on it; excluded ones sit grey on the axis. */
export function curveChart(
  curve: ValueCurve,
  names: Record<string, string>,
  labels: { excluded: string },
): EChartsCoreOption {
  const scored = curve.alternatives.filter((a) => a.value !== null)
  const excluded = curve.alternatives.filter((a) => a.value === null)
  return {
    grid: { left: 8, right: 24, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      ...TOOLTIP,
      trigger: 'item',
      formatter: (p: { seriesIndex: number; data: { name?: string; value: [number, number] } }) =>
        p.seriesIndex === 0
          ? `${formatScore(p.data.value[0])} → ${p.data.value[1].toFixed(2)}`
          : `<b>${p.data.name}</b><br/>${formatScore(p.data.value[0])}${
              p.seriesIndex === 2 ? ` (${labels.excluded})` : ` → ${p.data.value[1].toFixed(2)}`
            }`,
    },
    xAxis: { type: 'value', min: curve.low, max: curve.high, axisLabel: AXIS_LABEL, splitLine: SPLIT_LINE },
    yAxis: { type: 'value', min: 0, max: 1, interval: 0.25, axisLabel: AXIS_LABEL, splitLine: SPLIT_LINE },
    series: [
      {
        type: 'line',
        data: curve.points.map((point) => ({ value: point })),
        showSymbol: false,
        lineStyle: { width: 2.5, color: '#4f46e5' },
        z: 1,
      },
      {
        type: 'scatter',
        data: scored.map((a) => ({ name: names[a.id] ?? a.id, value: [a.x, a.value] })),
        symbolSize: 10,
        itemStyle: { color: '#0f172a', borderColor: '#fff', borderWidth: 1.5 },
        label: { show: scored.length <= 12, position: 'top', fontSize: 10, color: '#334155', formatter: '{b}' },
        z: 3,
      },
      {
        type: 'scatter',
        data: excluded.map((a) => ({ name: names[a.id] ?? a.id, value: [a.x, 0] })),
        symbol: 'diamond',
        symbolSize: 9,
        itemStyle: { color: '#cbd5e1' },
        z: 2,
      },
    ],
  }
}

/** Ranks shown separately in the rank distribution; later ranks are combined. */
export const SHOWN_RANKS = 5
// Rank 1 darkest; the combined rest in grey.
const RANK_COLORS = ['#3730a3', '#4f46e5', '#818cf8', '#a5b4fc', '#c7d2fe']

/** Stacked bars: each alternative's probability of each rank (best mean rank on top), in percent. */
export function rankDistributionChart(
  robustness: ProjectRobustness,
  labels: { rank: (r: number) => string; rest: (r: number) => string },
): EChartsCoreOption {
  const rows = [...robustness.alternatives].reverse() // ECharts draws the first category at the bottom
  const m = robustness.alternatives.length
  const shown = Math.min(m, SHOWN_RANKS)
  const series = Array.from({ length: shown }, (_, r) => ({
    name: labels.rank(r + 1),
    data: rows.map((a) => a.rank_probabilities[r] * 100),
    color: RANK_COLORS[r],
  }))
  if (m > shown) {
    series.push({
      name: labels.rest(shown + 1),
      data: rows.map((a) => a.rank_probabilities.slice(shown).reduce((x, y) => x + y, 0) * 100),
      color: '#e2e8f0',
    })
  }
  return {
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    legend: { top: 0, textStyle: { fontSize: 11, color: '#475569' } },
    tooltip: {
      ...TOOLTIP,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v: number) => `${v.toFixed(1)}%`,
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { ...AXIS_LABEL, formatter: '{value}%' },
      splitLine: SPLIT_LINE,
    },
    yAxis: {
      type: 'category',
      data: rows.map((a) => a.name),
      axisLabel: { ...AXIS_LABEL, formatter: (v: string) => truncate(v) },
    },
    series: series.map((s) => ({ ...s, type: 'bar', stack: 'ranks', barMaxWidth: 22, emphasis: { focus: 'series' } })),
  }
}

/** Heatmap of P(row beats column) in percent for the first `limit` alternatives. */
export function winsChart(robustness: ProjectRobustness, limit: number, beats: string): EChartsCoreOption {
  const names = robustness.alternatives.slice(0, limit).map((a) => a.name)
  const data = names.flatMap((_, i) =>
    names.map((__, j) => [j, i, i === j ? '-' : Math.round(robustness.wins[i][j] * 1000) / 10]),
  )
  return {
    grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      ...TOOLTIP,
      trigger: 'item',
      formatter: (p: { value: [number, number, number | string] }) =>
        typeof p.value[2] === 'number' ? `${names[p.value[1]]} ${beats} ${names[p.value[0]]}: ${p.value[2]}%` : '',
    },
    xAxis: {
      type: 'category',
      data: names,
      position: 'top',
      axisLabel: {
        ...AXIS_LABEL,
        interval: 0,
        rotate: names.length > 6 ? 40 : 0,
        formatter: (v: string) => truncate(v, 14),
      },
      splitArea: { show: false },
    },
    yAxis: {
      type: 'category',
      data: names,
      inverse: true,
      axisLabel: { ...AXIS_LABEL, formatter: (v: string) => truncate(v, 18) },
    },
    visualMap: { show: false, min: 0, max: 100, inRange: { color: ['#f8fafc', '#4338ca'] } },
    series: [
      {
        type: 'heatmap',
        data,
        label: {
          show: names.length <= 8,
          fontSize: 10,
          color: '#0f172a',
          textBorderColor: '#fff',
          textBorderWidth: 2,
          formatter: (p: { value: unknown[] }) => `${p.value[2]}`,
        },
        itemStyle: { borderColor: '#fff', borderWidth: 1 },
      },
    ],
  }
}
