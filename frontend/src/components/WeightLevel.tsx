// One weighting level (S4): the groups, or the criteria of one group, with the three methods.
import { ArrowDown, ArrowUp, Equal, Percent } from 'lucide-react'
import type { ReactNode } from 'react'
import type { LevelWeighting, LevelWeights, WeightingMethod } from '../api/types'
import { useT } from '../i18n/useT'
import { formatPercent } from '../lib/format'
import {
  AHP_MAX,
  comparison,
  equalDirect,
  fromScale,
  moveItem,
  normalizedDirect,
  pairs,
  rankRows,
  setComparison,
  setDirectWeight,
  setMethod,
  setTied,
  toScale,
} from '../lib/weighting'
import { NumberInput } from './NumberInput'
import { Badge, Button, Card, Segmented, Select } from './ui'

export interface LevelItem {
  id: string
  name: string
  /** Global weight (criteria in a grouped project); omitted when it equals the local weight. */
  global?: number
}

export function WeightLevel({
  title,
  actions,
  items,
  level,
  result,
  onChange,
  visible = () => true,
  controls,
  details,
}: {
  title: ReactNode
  actions?: ReactNode
  items: LevelItem[]
  level: LevelWeighting
  /** Local weights from the API (absent while loading or when the inputs are invalid). */
  result?: LevelWeights
  onChange: (level: LevelWeighting) => void
  /** Filter for the direct method's rows (search, hide zero). */
  visible?: (item: LevelItem) => boolean
  /** Extra controls next to an item's name (direction, settings button). */
  controls?: (id: string) => ReactNode
  /** Content below an item's row (the open settings panel). */
  details?: (id: string) => ReactNode
}) {
  const t = useT()
  const ids = items.map((i) => i.id)
  const method = level.method ?? 'direct'
  const local = (id: string) => result?.weights[id]
  const byId = new Map(items.map((i) => [i.id, i]))

  const weightCells = (item: LevelItem) => (
    <div className="w-28 text-right text-xs tabular-nums">
      <div className="text-slate-700">{local(item.id) === undefined ? '—' : formatPercent(local(item.id)!)}</div>
      {item.global !== undefined && (
        <div className="text-slate-400" title={t('weights.globalHint')}>
          {t('weights.global', { value: formatPercent(item.global) })}
        </div>
      )}
    </div>
  )

  const name = (item: LevelItem) => (
    <div className="min-w-0 truncate text-sm font-medium text-slate-800" title={item.name}>
      {item.name}
    </div>
  )

  const headerActions = (
    <>
      {method === 'direct' && items.length > 1 && (
        <>
          <Button variant="ghost" icon={<Equal className="size-4" />} onClick={() => onChange(equalDirect(level, ids))}>
            {t('weights.equal')}
          </Button>
          <Button
            variant="ghost"
            icon={<Percent className="size-4" />}
            onClick={() => onChange(normalizedDirect(level, ids))}
          >
            {t('weights.normalize')}
          </Button>
        </>
      )}
      {method === 'rank' && (
        <Select
          label={t('rank.formula')}
          value={level.formula ?? 'roc'}
          onChange={(formula) => onChange({ ...level, formula })}
          options={[
            { value: 'roc', label: t('rank.roc') },
            { value: 'rank_sum', label: t('rank.rankSum') },
          ]}
        />
      )}
      {actions}
    </>
  )

  return (
    <Card title={title} actions={headerActions}>
      {items.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-500">{t('weights.methodLabel')}</span>
          <Segmented<WeightingMethod>
            size="sm"
            value={method}
            onChange={(m) => onChange(setMethod(level, ids, m))}
            options={[
              { value: 'direct', label: t('weights.method.direct') },
              { value: 'rank', label: t('weights.method.rank') },
              { value: 'ahp', label: t('weights.method.ahp') },
            ]}
          />
        </div>
      )}

      {method === 'direct' && (
        <DirectRows
          items={items.filter(visible)}
          level={level}
          onChange={onChange}
          name={name}
          controls={controls}
          details={details}
          weightCells={weightCells}
        />
      )}

      {method === 'rank' && (
        <>
          <p className="mb-2 text-xs text-slate-500">{t('rank.hint')}</p>
          <ul className="divide-y divide-slate-100">
            {rankRows(ids, level.order ?? []).map((row, k, rows) => {
              const item = byId.get(row.id)!
              const move = (delta: -1 | 1) =>
                onChange({ ...level, order: moveItem(ids, level.order ?? [], row.id, delta) })
              return (
                <li key={row.id} className="py-2.5">
                  <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 sm:grid-cols-[2rem_minmax(0,14rem)_minmax(0,1fr)_auto_auto]">
                    <span className="bg-accent-50 text-accent-700 flex size-6 items-center justify-center rounded-full text-xs font-semibold">
                      {row.rank}
                    </span>
                    {name(item)}
                    <div className="flex items-center gap-2">{controls?.(row.id)}</div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        className="!p-1"
                        aria-label={`${t('rank.up')}: ${item.name}`}
                        disabled={k === 0}
                        onClick={() => move(-1)}
                        icon={<ArrowUp className="size-4" />}
                      />
                      <Button
                        variant="ghost"
                        className="!p-1"
                        aria-label={`${t('rank.down')}: ${item.name}`}
                        disabled={k === rows.length - 1}
                        onClick={() => move(1)}
                        icon={<ArrowDown className="size-4" />}
                      />
                      <label className="ml-2 inline-flex items-center gap-1.5 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          className="accent-accent-600"
                          disabled={k === 0}
                          checked={k > 0 && row.tiedWithPrevious}
                          aria-label={`${t('rank.tie')}: ${item.name}`}
                          onChange={(e) =>
                            onChange({ ...level, order: setTied(ids, level.order ?? [], row.id, e.target.checked) })
                          }
                        />
                        {t('rank.tie')}
                      </label>
                    </div>
                    {weightCells(item)}
                  </div>
                  {details?.(row.id)}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {method === 'ahp' && (
        <>
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.id} className="py-2.5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]">
                  {name(item)}
                  <div className="flex items-center gap-2">{controls?.(item.id)}</div>
                  {weightCells(item)}
                </div>
                {details?.(item.id)}
              </li>
            ))}
          </ul>
          <AhpEditor items={items} level={level} result={result} onChange={onChange} />
        </>
      )}
    </Card>
  )
}

function DirectRows({
  items,
  level,
  onChange,
  name,
  controls,
  details,
  weightCells,
}: {
  items: LevelItem[]
  level: LevelWeighting
  onChange: (level: LevelWeighting) => void
  name: (item: LevelItem) => ReactNode
  controls?: (id: string) => ReactNode
  details?: (id: string) => ReactNode
  weightCells: (item: LevelItem) => ReactNode
}) {
  const t = useT()
  const weights = level.weights ?? {}
  const sliderMax = Math.max(1, ...Object.values(weights))
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((item) => {
        const weight = weights[item.id] ?? 0
        return (
          <li key={item.id} className="py-2.5">
            <div className="grid grid-cols-1 items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,14rem)_auto_minmax(0,1fr)_auto]">
              {name(item)}
              <div className="flex items-center gap-2">{controls?.(item.id)}</div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={sliderMax}
                  step={sliderMax / 1000}
                  value={weight}
                  aria-label={`${t('common.weight')} ${item.name}`}
                  onChange={(e) => onChange(setDirectWeight(level, item.id, Number(e.target.value)))}
                  className="accent-accent-600 min-w-0 flex-1"
                />
                <NumberInput
                  value={weight}
                  label={`${t('common.weight')} ${item.name}`}
                  onCommit={(value) => value !== null && value >= 0 && onChange(setDirectWeight(level, item.id, value))}
                  className="w-20"
                />
              </div>
              {weightCells(item)}
            </div>
            {details?.(item.id)}
          </li>
        )
      })}
    </ul>
  )
}

function AhpEditor({
  items,
  level,
  result,
  onChange,
}: {
  items: LevelItem[]
  level: LevelWeighting
  result?: LevelWeights
  onChange: (level: LevelWeighting) => void
}) {
  const t = useT()
  const names = new Map(items.map((i) => [i.id, i.name]))
  const ahp = result?.ahp
  const worst = new Map((ahp && !ahp.consistent ? ahp.worst_pairs : []).map((p) => [`${p.i}|${p.j}`, p]))
  const implied = (i: string, j: string) => {
    const p = worst.get(`${i}|${j}`)
    if (p) return p.implied
    const q = worst.get(`${j}|${i}`)
    return q ? 1 / q.implied : null
  }
  const describe = (i: string, j: string, value: number | null) => {
    if (value === null) return t('ahp.missing')
    const position = toScale(value)
    if (position === 0) return t('ahp.equal')
    return t('ahp.more', { name: names.get(position > 0 ? i : j)!, n: Math.abs(position) + 1 })
  }
  const ratio = (value: number) => (value >= 1 ? value.toFixed(1) : `1/${(1 / value).toFixed(1)}`)

  return (
    <section className="mt-4 border-t border-slate-100 pt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-slate-600">{t('ahp.title')}</h3>
          <p className="text-xs text-slate-500">{t('ahp.scale')}</p>
        </div>
        {ahp && <Badge tone={ahp.consistent ? 'green' : 'amber'}>{t('ahp.cr', { cr: ahp.cr.toFixed(3) })}</Badge>}
      </div>
      {ahp && !ahp.consistent && <p className="mb-3 text-xs text-amber-700">{t('ahp.inconsistent')}</p>}
      <ul className="space-y-2">
        {pairs(items.map((i) => i.id)).map(([i, j]) => {
          const value = comparison(level, i, j)
          const hint = implied(i, j)
          return (
            <li
              key={`${i}|${j}`}
              className={`rounded-lg px-3 py-2 ${hint !== null ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-slate-50'}`}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(8rem,16rem)_minmax(0,1fr)] items-center gap-3 text-sm">
                <span className="truncate text-right text-slate-700" title={names.get(i)}>
                  {names.get(i)}
                </span>
                <input
                  type="range"
                  min={-(AHP_MAX - 1)}
                  max={AHP_MAX - 1}
                  step={1}
                  // Left is "the left item is more important", so the slider runs from +8 to -8.
                  value={-toScale(value)}
                  aria-label={t('ahp.compare', { i: names.get(i)!, j: names.get(j)! })}
                  onChange={(e) => onChange(setComparison(level, i, j, fromScale(-Number(e.target.value))))}
                  className="accent-accent-600 w-full"
                />
                <span className="truncate text-slate-700" title={names.get(j)}>
                  {names.get(j)}
                </span>
              </div>
              <div className="mt-1 text-center text-xs text-slate-500">
                {describe(i, j, value)}
                {hint !== null && (
                  <span className="ml-2 text-amber-700">{t('ahp.implied', { value: ratio(hint) })}</span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
