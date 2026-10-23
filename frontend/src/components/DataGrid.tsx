import { Plus, X } from 'lucide-react'
import type { Criterion, Project, RawValue } from '../api/types'
import type { Translate } from '../i18n/useT'
import { useT } from '../i18n/useT'
import {
  addAlternative,
  addCriterion,
  directionOf,
  raw,
  removeAlternative,
  removeCriterion,
  renameAlternative,
  setValue,
  updateCriterion,
} from '../lib/project'
import { NumberInput } from './NumberInput'
import { Button } from './ui'

type Update = (change: (project: Project) => Project) => void

function NameInput({
  value,
  onChange,
  label,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  label: string
  className?: string
}) {
  return (
    <input
      type="text"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`focus:ring-accent-500/40 min-w-0 rounded-md border px-2 py-1 text-sm focus:ring-2 focus:outline-none ${
        value.trim()
          ? 'focus:border-accent-500 border-transparent bg-transparent hover:border-slate-200 focus:bg-white'
          : 'border-red-300 bg-red-50'
      } ${className}`}
    />
  )
}

/** Short description of how a criterion is scored, shown under its name. */
function criterionKind(t: Translate, criterion: Criterion): { text: string; tone: string } {
  const direction = directionOf(criterion)
  if (direction) {
    return direction === 'cost'
      ? { text: t('common.cost'), tone: 'text-amber-600' }
      : { text: t('common.benefit'), tone: 'text-emerald-600' }
  }
  if (criterion.type === 'ordinal') return { text: t('type.ordinal'), tone: 'text-sky-600' }
  if (criterion.type === 'categorical') return { text: t('type.categorical'), tone: 'text-sky-600' }
  const kind = criterion.value_function?.kind
  return { text: t(kind === 'target' ? 'type.target' : 'type.custom'), tone: 'text-sky-600' }
}

function CellEditor({
  criterion,
  value,
  label,
  onChange,
}: {
  criterion: Criterion
  value: RawValue
  label: string
  onChange: (value: RawValue) => void
}) {
  const t = useT()
  const select = 'w-24 rounded-md border border-transparent bg-transparent px-1 py-1 text-sm hover:border-slate-200'
  if (criterion.type === 'boolean') {
    return (
      <select
        aria-label={label}
        className={select}
        value={value === null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value === 'true')}
      >
        <option value="">–</option>
        <option value="true">{t('common.yes')}</option>
        <option value="false">{t('common.no')}</option>
      </select>
    )
  }
  if (criterion.type === 'ordinal' || criterion.type === 'categorical') {
    return (
      <select
        aria-label={label}
        className={select}
        value={value === null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      >
        <option value="">–</option>
        {(criterion.categories ?? []).map((c) => (
          <option key={c.label} value={c.label}>
            {c.label}
          </option>
        ))}
      </select>
    )
  }
  return (
    <NumberInput
      value={typeof value === 'number' ? value : null}
      label={label}
      onCommit={onChange}
      className="w-24"
      validClassName="focus:border-accent-500 border-transparent bg-transparent hover:border-slate-200 focus:bg-white"
      emptyClassName="border-dashed border-slate-300 bg-slate-50"
    />
  )
}

export function DataGrid({ project, update }: { project: Project; update: Update }) {
  const t = useT()

  return (
    <div>
      <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200">
        <table className="border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                {t('common.alternative')} \ {t('common.criterion')}
              </th>
              {project.criteria.map((criterion, j) => {
                const kind = criterionKind(t, criterion)
                return (
                  <th
                    key={criterion.id}
                    className="sticky top-0 z-10 border-b border-l border-slate-200 bg-slate-50 px-1 py-1.5 align-top font-normal"
                  >
                    <div className="flex items-start gap-0.5">
                      <NameInput
                        value={criterion.name}
                        label={`${t('common.criterion')} ${j + 1}`}
                        onChange={(name) => update((p) => updateCriterion(p, criterion.id, { name }))}
                        className="w-32 font-medium"
                      />
                      <button
                        type="button"
                        title={t('common.delete')}
                        onClick={() => update((p) => removeCriterion(p, criterion.id))}
                        className="mt-1 rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                    <div className={`px-2 text-left text-[11px] ${kind.tone}`}>{kind.text}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {project.alternatives.map((alternative, i) => (
              <tr key={alternative.id} className="group">
                <th className="sticky left-0 z-10 border-b border-slate-100 bg-white px-1 py-1 text-left font-normal group-hover:bg-slate-50">
                  <div className="flex items-center gap-0.5">
                    <NameInput
                      value={alternative.name}
                      label={`${t('common.alternative')} ${i + 1}`}
                      onChange={(name) => update((p) => renameAlternative(p, alternative.id, name))}
                      className="w-44 font-medium"
                    />
                    <button
                      type="button"
                      title={t('common.delete')}
                      onClick={() => update((p) => removeAlternative(p, alternative.id))}
                      className="rounded p-0.5 text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 focus:opacity-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </th>
                {project.criteria.map((criterion) => (
                  <td
                    key={criterion.id}
                    className="border-b border-l border-slate-100 px-1 py-1 group-hover:bg-slate-50"
                  >
                    <CellEditor
                      criterion={criterion}
                      value={raw(project, criterion.id, alternative.id)}
                      label={`${alternative.name} / ${criterion.name}`}
                      onChange={(value) => update((p) => setValue(p, criterion.id, alternative.id, value))}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          icon={<Plus className="size-4" />}
          onClick={() => update((p) => addAlternative(p, t('data.newAlternative')))}
        >
          {t('data.addAlternative')}
        </Button>
        <Button
          icon={<Plus className="size-4" />}
          onClick={() => update((p) => addCriterion(p, t('data.newCriterion')))}
        >
          {t('data.addCriterion')}
        </Button>
      </div>
    </div>
  )
}
