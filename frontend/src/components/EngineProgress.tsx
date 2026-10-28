// Start-up progress of the browser engine (ADR 0009); nothing is shown for the server engine.
import { CircleAlert, Cpu } from 'lucide-react'
import { useEngineStatus } from '../engine'
import type { EnginePhase } from '../engine/protocol'
import type { MessageKey } from '../i18n/messages'
import { useT } from '../i18n/useT'
import { Spinner } from './ui'

const PHASES: EnginePhase[] = ['runtime', 'packages', 'code']

export function EngineProgress() {
  const t = useT()
  const { phase } = useEngineStatus()
  if (phase === 'ready' || phase === 'idle') return null

  if (phase === 'failed') {
    return (
      <div
        role="alert"
        className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
      >
        <CircleAlert className="size-4 shrink-0" />
        {t('engine.failed')}
      </div>
    )
  }

  const step = PHASES.indexOf(phase)
  return (
    <div role="status" className="border-accent-100 bg-accent-50 mb-4 rounded-lg border p-3 text-sm">
      <div className="text-accent-800 flex items-center gap-2 font-medium">
        <Cpu className="size-4 shrink-0" />
        {t('engine.title')}: {t(`engine.${phase}` as MessageKey)} ({step + 1}/{PHASES.length})
        <Spinner />
      </div>
      <div className="bg-accent-100 mt-2 h-1.5 rounded-full" aria-hidden>
        <div
          className="bg-accent-500 h-1.5 rounded-full transition-all"
          style={{ width: `${((step + 0.5) / PHASES.length) * 100}%` }}
        />
      </div>
      <p className="text-accent-700 mt-2 text-xs">{t('engine.hint')}</p>
    </div>
  )
}
