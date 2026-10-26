import { Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type {
  Constraint,
  ConstraintOp,
  Criterion,
  MissingPolicy,
  NewConstraint,
  Project,
  ValueCurve,
  ValueFunction,
} from '../api/types'
import { useApiPost } from '../hooks'
import type { MessageKey } from '../i18n/messages'
import { useT } from '../i18n/useT'
import { curveChart } from '../lib/charts'
import { addConstraint, constraintsFor, numericRange, removeConstraint, updateCriterion } from '../lib/project'
import { EChart } from './EChart'
import { ApiErrorBox } from './IssueList'
import { NumberInput } from './NumberInput'
import { Button, Segmented, Select, Spinner } from './ui'

type Update = (change: (project: Project) => Project) => void
type Kind = 'linear' | 'log' | 'target' | 'threshold' | 'piecewise'
const KINDS: Kind[] = ['linear', 'log', 'target', 'threshold', 'piecewise']
const MISSING: MissingPolicy[] = ['worst', 'mean', 'exclude', 'require']

/** The editor kind of a value function; a two-point curve with scores 0 and 1 is a threshold. */
function kindOf(vf: ValueFunction): Kind {
  if (vf.kind !== 'piecewise') return vf.kind
  const scores = vf.points.map((p) => p[1]).sort()
  return scores.length === 2 && scores[0] === 0 && scores[1] === 1 ? 'threshold' : 'piecewise'
}

/** A sensible starting function of the chosen kind, based on the data range. */
function defaultFunction(kind: Kind, current: ValueFunction, range: [number, number]): ValueFunction {
  const [low, high] = range[0] === range[1] ? [range[0], range[0] + 1] : range
  const at = (share: number) => Number((low + (high - low) * share).toPrecision(6))
  const direction = current.kind === 'linear' || current.kind === 'log' ? current.direction : 'benefit'
  switch (kind) {
    case 'linear':
    case 'log':
      return { kind, direction, bounds: 'data' }
    case 'target':
      return { kind: 'target', lower: low, ideal_low: at(0.4), ideal_high: at(0.6), upper: high }
    case 'threshold':
      return {
        kind: 'piecewise',
        points: [
          [low, 0],
          [high, 1],
        ],
      }
    case 'piecewise':
      return {
        kind: 'piecewise',
        points: [
          [low, 0],
          [at(0.5), 0.5],
          [high, 1],
        ],
      }
  }
}

export function CriterionSettings({
  project,
  apiProject,
  criterion,
  update,
}: {
  project: Project
  apiProject: Project | null
  criterion: Criterion
  update: Update
}) {
  const t = useT()
  const set = (patch: Partial<Criterion>) => update((p) => updateCriterion(p, criterion.id, patch))

  return (
    <div className="mt-3 grid gap-5 rounded-lg border border-slate-200 bg-slate-50/60 p-4 lg:grid-cols-2">
      <div className="space-y-5">
        {criterion.type === 'numeric' && criterion.value_function && (
          <ValueFunctionEditor
            criterion={criterion}
            range={numericRange(project, criterion.id) ?? [0, 1]}
            onChange={(value_function) => set({ value_function })}
          />
        )}
        {(criterion.type === 'ordinal' || criterion.type === 'categorical') && (
          <section>
            <h4 className="mb-2 text-xs font-semibold text-slate-600">{t('settings.scores')}</h4>
            <ul className="space-y-1.5">
              {(criterion.categories ?? []).map((category, i) => (
                <li key={category.label} className="flex items-center gap-2 text-sm">
                  <span className="w-40 truncate text-slate-700" title={category.label}>
                    {category.label}
                  </span>
                  <NumberInput
                    value={category.score}
                    label={`${criterion.name}: ${category.label}`}
                    className="w-20"
                    onCommit={(score) =>
                      score !== null &&
                      score >= 0 &&
                      score <= 1 &&
                      set({
                        categories: (criterion.categories ?? []).map((c, j) => (j === i ? { ...c, score } : c)),
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
        <Select<MissingPolicy>
          label={t('settings.missing')}
          value={criterion.missing ?? 'worst'}
          onChange={(missing) => set({ missing })}
          options={MISSING.map((m) => ({ value: m, label: t(`missing.${m}` as MessageKey) }))}
        />
        <ConstraintsEditor project={project} criterion={criterion} update={update} />
      </div>
      {criterion.type === 'numeric' && <CurvePreview project={apiProject} criterion={criterion} />}
    </div>
  )
}

function ValueFunctionEditor({
  criterion,
  range,
  onChange,
}: {
  criterion: Criterion
  range: [number, number]
  onChange: (vf: ValueFunction) => void
}) {
  const t = useT()
  const vf = criterion.value_function!
  const kind = kindOf(vf)
  const number = (value: number, label: string, commit: (v: number) => void) => (
    <label className="flex items-center justify-between gap-2 text-sm text-slate-600">
      {label}
      <NumberInput
        value={value}
        label={`${criterion.name}: ${label}`}
        className="w-24"
        onCommit={(v) => v !== null && commit(v)}
      />
    </label>
  )

  return (
    <section className="space-y-3">
      <Select<Kind>
        label={t('settings.valueFunction')}
        value={kind}
        onChange={(next) => onChange(defaultFunction(next, vf, range))}
        options={KINDS.map((k) => ({ value: k, label: t(`vf.${k}` as MessageKey) }))}
      />

      {(vf.kind === 'linear' || vf.kind === 'log') && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            {t('vf.range')}
            <Segmented<'data' | 'fixed'>
              size="sm"
              value={vf.bounds === 'data' ? 'data' : 'fixed'}
              onChange={(mode) => onChange({ ...vf, bounds: mode === 'data' ? 'data' : range })}
              options={[
                { value: 'data', label: t('vf.rangeData') },
                { value: 'fixed', label: t('vf.rangeFixed') },
              ]}
            />
          </div>
          {vf.bounds !== 'data' && (
            <div className="flex items-center gap-2 text-sm">
              <NumberInput
                value={vf.bounds[0]}
                label={`${criterion.name}: min`}
                className="w-24"
                onCommit={(v) => v !== null && vf.bounds !== 'data' && onChange({ ...vf, bounds: [v, vf.bounds[1]] })}
              />
              –
              <NumberInput
                value={vf.bounds[1]}
                label={`${criterion.name}: max`}
                className="w-24"
                onCommit={(v) => v !== null && vf.bounds !== 'data' && onChange({ ...vf, bounds: [vf.bounds[0], v] })}
              />
            </div>
          )}
        </div>
      )}

      {vf.kind === 'target' && (
        <div className="grid gap-1.5">
          {number(vf.lower, t('vf.lower'), (lower) => onChange({ ...vf, lower }))}
          {number(vf.ideal_low, t('vf.idealLow'), (ideal_low) => onChange({ ...vf, ideal_low }))}
          {number(vf.ideal_high, t('vf.idealHigh'), (ideal_high) => onChange({ ...vf, ideal_high }))}
          {number(vf.upper, t('vf.upper'), (upper) => onChange({ ...vf, upper }))}
        </div>
      )}

      {vf.kind === 'piecewise' && kind === 'threshold' && (
        <ThresholdEditor points={vf.points} number={number} onChange={(points) => onChange({ ...vf, points })} />
      )}

      {vf.kind === 'piecewise' && kind === 'piecewise' && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs text-slate-500">
            <span>{t('vf.x')}</span>
            <span>{t('vf.v')}</span>
            <span />
          </div>
          {vf.points.map(([x, v], i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
              <NumberInput
                value={x}
                label={`${t('vf.point')} ${i + 1} ${t('vf.x')}`}
                onCommit={(nx) =>
                  nx !== null && onChange({ ...vf, points: vf.points.map((p, j) => (j === i ? [nx, p[1]] : p)) })
                }
              />
              <NumberInput
                value={v}
                label={`${t('vf.point')} ${i + 1} ${t('vf.v')}`}
                onCommit={(nv) =>
                  nv !== null && onChange({ ...vf, points: vf.points.map((p, j) => (j === i ? [p[0], nv] : p)) })
                }
              />
              <button
                type="button"
                title={t('common.delete')}
                disabled={vf.points.length <= 2}
                onClick={() => onChange({ ...vf, points: vf.points.filter((_, j) => j !== i) })}
                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          <Button
            variant="ghost"
            icon={<Plus className="size-4" />}
            onClick={() => {
              const [lastX] = vf.points[vf.points.length - 1]
              onChange({ ...vf, points: [...vf.points, [lastX + Math.max(1, Math.abs(lastX) * 0.1), 1]] })
            }}
          >
            {t('vf.addPoint')}
          </Button>
        </div>
      )}
    </section>
  )
}

/** "Scoring starts at X, full score at Y": a two-point curve, rising or falling. */
function ThresholdEditor({
  points,
  number,
  onChange,
}: {
  points: [number, number][]
  number: (value: number, label: string, commit: (v: number) => void) => React.ReactNode
  onChange: (points: [number, number][]) => void
}) {
  const t = useT()
  const start = points.find((p) => p[1] === 0)![0]
  const full = points.find((p) => p[1] === 1)![0]
  const build = (s: number, f: number): [number, number][] =>
    s <= f
      ? [
          [s, 0],
          [f, 1],
        ]
      : [
          [f, 1],
          [s, 0],
        ]
  return (
    <div className="grid gap-1.5">
      {number(start, t('vf.thresholdStart'), (s) => s !== full && onChange(build(s, full)))}
      {number(full, t('vf.thresholdFull'), (f) => f !== start && onChange(build(start, f)))}
    </div>
  )
}

function CurvePreview({ project, criterion }: { project: Project | null; criterion: Criterion }) {
  const t = useT()
  const curve = useApiPost<ValueCurve>('/projects/curve', project && { project, criterion_id: criterion.id }, 300)
  const names = useMemo(() => Object.fromEntries((project?.alternatives ?? []).map((a) => [a.id, a.name])), [project])
  const option = useMemo(
    () => (curve.data ? curveChart(curve.data, names, { excluded: t('vf.excluded') }) : null),
    [curve.data, names, t],
  )
  return (
    <section>
      <h4 className="mb-1 flex items-center gap-2 text-xs font-semibold text-slate-600">
        {t('vf.curve')}
        {curve.loading && <Spinner />}
      </h4>
      <p className="mb-2 text-xs text-slate-500">{t('vf.curveHint')}</p>
      {curve.error && <ApiErrorBox error={curve.error} project={project} />}
      {option && <EChart option={option} height={240} />}
    </section>
  )
}

const OPS: ConstraintOp[] = ['>=', '<=', '>', '<', 'between', 'present']

function describeConstraint(t: ReturnType<typeof useT>, c: Constraint, unit: string): string {
  const missing = c.allow_missing ? ` (${t('settings.allowMissing')})` : ''
  switch (c.op) {
    case 'between':
      return `${t('op.between')} ${c.low} – ${c.high}${unit}${missing}`
    case 'in':
      return `∈ { ${c.labels.join(', ')} }${missing}`
    case 'present':
      return t('op.present')
    default:
      return `${c.op} ${c.value}${unit}${missing}`
  }
}

function ConstraintsEditor({ project, criterion, update }: { project: Project; criterion: Criterion; update: Update }) {
  const t = useT()
  const existing = constraintsFor(project, criterion.id)
  const numeric = criterion.type === 'numeric'
  const labels = (criterion.categories ?? []).map((c) => c.label)
  const range = numericRange(project, criterion.id)
  const [op, setOp] = useState<ConstraintOp>(numeric ? '>=' : criterion.type === 'boolean' ? 'present' : 'in')
  const [value, setValue] = useState<number | null>(range ? range[0] : 0)
  const [high, setHigh] = useState<number | null>(range ? range[1] : 1)
  const [allowed, setAllowed] = useState<string[]>(labels)
  const [allowMissing, setAllowMissing] = useState(false)

  const ops: ConstraintOp[] = numeric ? OPS : criterion.type === 'boolean' ? ['present'] : ['in', 'present']
  const draft = (): NewConstraint | null => {
    const base = { criterion_id: criterion.id, allow_missing: op === 'present' ? false : allowMissing }
    if (op === 'present') return { ...base, op }
    if (op === 'in') return allowed.length ? { ...base, op, labels: allowed } : null
    if (op === 'between') return value !== null && high !== null ? { ...base, op, low: value, high } : null
    return value !== null ? { ...base, op, value } : null
  }

  return (
    <section>
      <h4 className="text-xs font-semibold text-slate-600">{t('settings.constraints')}</h4>
      <p className="mb-2 text-xs text-slate-500">{t('settings.constraintsHint')}</p>
      {existing.length === 0 ? (
        <p className="mb-2 text-sm text-slate-500">{t('settings.noConstraints')}</p>
      ) : (
        <ul className="mb-2 space-y-1">
          {existing.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 text-sm">
              <span>
                <span className="font-medium">{criterion.name}</span> {describeConstraint(t, c, criterion.unit ?? '')}
              </span>
              <button
                type="button"
                title={t('common.delete')}
                onClick={() => update((p) => removeConstraint(p, c.id))}
                className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          aria-label={`${criterion.name}: ${t('settings.constraints')}`}
          value={op}
          onChange={(e) => setOp(e.target.value as ConstraintOp)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
        >
          {ops.map((o) => (
            <option key={o} value={o}>
              {o === 'present' ? t('op.present') : o === 'between' ? t('op.between') : o === 'in' ? '∈' : o}
            </option>
          ))}
        </select>
        {numeric && op !== 'present' && (
          <NumberInput value={value} label={`${criterion.name}: value`} className="w-24" onCommit={setValue} />
        )}
        {numeric && op === 'between' && (
          <>
            –
            <NumberInput value={high} label={`${criterion.name}: high`} className="w-24" onCommit={setHigh} />
          </>
        )}
        {op === 'in' && (
          <span className="flex flex-wrap gap-2">
            {labels.map((label) => (
              <label key={label} className="inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={allowed.includes(label)}
                  onChange={(e) =>
                    setAllowed(e.target.checked ? [...allowed, label] : allowed.filter((l) => l !== label))
                  }
                  className="accent-accent-600"
                />
                {label}
              </label>
            ))}
          </span>
        )}
        {op !== 'present' && (
          <label className="inline-flex items-center gap-1 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={allowMissing}
              onChange={(e) => setAllowMissing(e.target.checked)}
              className="accent-accent-600"
            />
            {t('settings.allowMissing')}
          </label>
        )}
        <Button
          icon={<Plus className="size-4" />}
          disabled={draft() === null}
          onClick={() => {
            const constraint = draft()
            if (constraint) update((p) => addConstraint(p, constraint))
          }}
        >
          {t('settings.addConstraint')}
        </Button>
      </div>
    </section>
  )
}
