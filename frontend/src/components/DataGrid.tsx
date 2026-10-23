import { Plus, X } from 'lucide-react'
import type { DraftProblem } from '../api/types'
import { useT } from '../i18n/useT'
import {
  addAlternative,
  addCriterion,
  removeAlternative,
  removeCriterion,
  renameAlternative,
  setCell,
  updateCriterion,
} from '../lib/problem'
import { NumberInput } from './NumberInput'
import { Button } from './ui'

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

export function DataGrid({
  draft,
  update,
}: {
  draft: DraftProblem
  update: (change: (draft: DraftProblem) => DraftProblem) => void
}) {
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
              {draft.criteria.map((criterion, j) => (
                <th
                  key={j}
                  className="sticky top-0 z-10 border-b border-l border-slate-200 bg-slate-50 px-1 py-1.5 align-top font-normal"
                >
                  <div className="flex items-start gap-0.5">
                    <NameInput
                      value={criterion.name}
                      label={`${t('common.criterion')} ${j + 1}`}
                      onChange={(name) => update((d) => updateCriterion(d, j, { name }))}
                      className="w-32 font-medium"
                    />
                    <button
                      type="button"
                      title={t('common.delete')}
                      onClick={() => update((d) => removeCriterion(d, j))}
                      className="mt-1 rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  <div
                    className={`px-2 text-left text-[11px] ${criterion.direction === 'cost' ? 'text-amber-600' : 'text-emerald-600'}`}
                  >
                    {criterion.direction === 'cost' ? t('common.cost') : t('common.benefit')}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.alternatives.map((name, i) => (
              <tr key={i} className="group">
                <th className="sticky left-0 z-10 border-b border-slate-100 bg-white px-1 py-1 text-left font-normal group-hover:bg-slate-50">
                  <div className="flex items-center gap-0.5">
                    <NameInput
                      value={name}
                      label={`${t('common.alternative')} ${i + 1}`}
                      onChange={(value) => update((d) => renameAlternative(d, i, value))}
                      className="w-44 font-medium"
                    />
                    <button
                      type="button"
                      title={t('common.delete')}
                      onClick={() => update((d) => removeAlternative(d, i))}
                      className="rounded p-0.5 text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 focus:opacity-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </th>
                {draft.matrix[i].map((value, j) => (
                  <td key={j} className="border-b border-l border-slate-100 px-1 py-1 group-hover:bg-slate-50">
                    <NumberInput
                      value={value}
                      label={`${name} / ${draft.criteria[j].name}`}
                      onCommit={(v) => update((d) => setCell(d, i, j, v))}
                      className="w-24"
                      validClassName="border-transparent bg-transparent hover:border-slate-200 focus:border-accent-500 focus:bg-white"
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
          onClick={() => update((d) => addAlternative(d, t('data.newAlternative')))}
        >
          {t('data.addAlternative')}
        </Button>
        <Button
          icon={<Plus className="size-4" />}
          onClick={() => update((d) => addCriterion(d, t('data.newCriterion')))}
        >
          {t('data.addCriterion')}
        </Button>
      </div>
    </div>
  )
}
