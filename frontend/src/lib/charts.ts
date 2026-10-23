// ECharts option builders (pure functions of API results).
import type { EChartsCoreOption } from 'echarts'
import type { Interval, MethodResult } from '../api/types'
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

/** Horizontal bars, best alternative on top. */
export function scoreChart(result: MethodResult, color = '#4f46e5'): EChartsCoreOption {
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
          value: r.score,
          itemStyle: { color: r.rank === 1 ? color : `${color}99`, borderRadius: [0, 4, 4, 0] },
        })),
        label: {
          show: true,
          position: 'right',
          fontSize: 11,
          color: '#475569',
          formatter: ({ value }: { value: number }) => formatScore(value),
        },
        barMaxWidth: 22,
      },
    ],
  }
}

/** One line per alternative across methods; rank 1 at the top. */
export function rankChart(results: MethodResult[]): EChartsCoreOption {
  const names = results[0]?.alternatives.map((a) => a.name) ?? []
  const n = names.length
  return {
    grid: { left: 8, right: 150, top: 16, bottom: 8, containLabel: true },
    tooltip: { ...TOOLTIP, trigger: 'item' },
    xAxis: {
      type: 'category',
      data: results.map((r) => r.label),
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

/** Stacked bars: each criterion's contribution to the weighted-sum score. */
export function breakdownChart(result: MethodResult, criteria: string[]): EChartsCoreOption {
  const rows = [...result.alternatives].sort((a, b) => b.rank - a.rank)
  const used = criteria
    .map((name, j) => ({ name, j }))
    .filter(({ j }) => rows.some((r) => (r.contributions?.[j] ?? 0) !== 0))
  return {
    grid: { left: 8, right: 16, top: 40, bottom: 8, containLabel: true },
    legend: { type: 'scroll', top: 0, textStyle: { fontSize: 11, color: '#475569' }, pageIconSize: 10 },
    tooltip: {
      ...TOOLTIP,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v: number) => formatScore(v),
    },
    xAxis: { type: 'value', axisLabel: AXIS_LABEL, splitLine: SPLIT_LINE },
    yAxis: {
      type: 'category',
      data: rows.map((r) => r.name),
      axisLabel: { ...AXIS_LABEL, formatter: (v: string) => truncate(v) },
    },
    series: used.map(({ name, j }, k) => ({
      name,
      type: 'bar',
      stack: 'total',
      data: rows.map((r) => r.contributions?.[j] ?? 0),
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
