import { BarChart, LineChart, ScatterChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'

// Register only what the app uses, which keeps the bundle small.
echarts.use([BarChart, LineChart, ScatterChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer])

/** Thin ECharts wrapper: one chart instance per element, resized with its container. */
export function EChart({ option, height = 320, onClick }: {
  option: echarts.EChartsCoreOption
  height?: number
  onClick?: (params: echarts.ECElementEvent) => void
}) {
  const element = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!element.current) return
    const instance = echarts.init(element.current, undefined, { renderer: 'svg' })
    chart.current = instance
    const observer = new ResizeObserver(() => instance.resize())
    observer.observe(element.current)
    return () => {
      observer.disconnect()
      instance.dispose()
      chart.current = null
    }
  }, [])

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true })
  }, [option])

  useEffect(() => {
    const instance = chart.current
    if (!instance || !onClick) return
    instance.on('click', onClick)
    return () => {
      instance.off('click', onClick)
    }
  }, [onClick])

  return <div ref={element} style={{ height }} className="w-full" />
}
