import { ArrowLeftRight, Upload, X } from 'lucide-react'
import { useState } from 'react'
import { type ApiError, asApiError, postJson, uploadFile } from '../api/client'
import type { Direction, Project, TableColumn, TableColumnSpec, TableInspection } from '../api/types'
import type { MessageKey } from '../i18n/messages'
import { useT } from '../i18n/useT'
import { ApiErrorBox } from './IssueList'
import { NumberInput } from './NumberInput'
import { Button, Card, Segmented, Select, Spinner } from './ui'

type CriterionType = TableColumnSpec['type']
const TYPES: CriterionType[] = ['numeric', 'ordinal', 'categorical', 'boolean']

interface Choice {
  use: boolean
  type: CriterionType
  direction: Direction
  order: string[]
}

/** Defaults from detection: numbers, levels and yes/no are used; free text and categories are not. */
function initialChoices(inspection: TableInspection): Record<number, Choice> {
  return Object.fromEntries(
    inspection.columns.map((c) => {
      const type: CriterionType = TYPES.includes(c.detected_type as CriterionType)
        ? (c.detected_type as CriterionType)
        : 'categorical'
      const use = ['numeric', 'ordinal', 'boolean'].includes(c.detected_type) && c.index !== inspection.name_column
      return [c.index, { use, type, direction: 'benefit', order: [...c.categories] } satisfies Choice]
    }),
  )
}

const typeLabel = (t: ReturnType<typeof useT>, type: string) => t(`type.${type}` as MessageKey)

export function ColumnMapper({
  file,
  filename,
  initial,
  onDone,
  onCancel,
}: {
  file: Blob
  filename: string
  initial: TableInspection
  onDone: (project: Project) => void
  onCancel: () => void
}) {
  const t = useT()
  const [inspection, setInspection] = useState(initial)
  const [nameColumn, setNameColumn] = useState(initial.name_column ?? 0)
  const [choices, setChoices] = useState(() => initialChoices(initial))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  /** Read the file again; without `header_row` the server detects it (e.g. for a newly chosen sheet). */
  const reinspect = async (params: { sheet?: string | null; header_row?: number }) => {
    setBusy(true)
    setError(null)
    try {
      const query = new URLSearchParams()
      const sheet = params.sheet ?? inspection.sheet
      if (sheet) query.set('sheet', sheet)
      if (params.header_row !== undefined) query.set('header_row', String(params.header_row))
      const next = await uploadFile<TableInspection>(`/tables/inspect?${query}`, file, filename)
      setInspection(next)
      setNameColumn(next.name_column ?? 0)
      setChoices(initialChoices(next))
    } catch (err) {
      setError(asApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const update = (index: number, patch: Partial<Choice>) =>
    setChoices((all) => ({ ...all, [index]: { ...all[index], ...patch } }))

  const columns = inspection.columns.filter((c) => c.index !== nameColumn)
  const used = columns.filter((c) => choices[c.index]?.use)

  const build = async () => {
    setBusy(true)
    setError(null)
    try {
      const specs: TableColumnSpec[] = used.map((c) => {
        const choice = choices[c.index]
        return {
          index: c.index,
          type: choice.type,
          direction: choice.direction,
          categories: choice.type === 'ordinal' || choice.type === 'categorical' ? choice.order : null,
        }
      })
      const project = await postJson<Project>('/tables/build', {
        rows: inspection.rows,
        header_row: inspection.header_row,
        name_column: nameColumn,
        columns: specs,
        filename,
        sheet: inspection.sheet,
      })
      onDone(project)
    } catch (err) {
      setError(asApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const header = inspection.rows[inspection.header_row] ?? []
  const preview = inspection.rows.slice(inspection.header_row + 1, inspection.header_row + 6)

  return (
    <Card
      title={
        <span>
          {t('map.title')} · <span className="font-normal text-slate-500">{filename}</span>
        </span>
      }
      actions={busy && <Spinner />}
    >
      <p className="mb-4 text-sm text-slate-600">{t('map.intro')}</p>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        {inspection.sheets.length > 1 && (
          <Select<string>
            label={t('map.sheet')}
            value={inspection.sheet ?? inspection.sheets[0]}
            onChange={(sheet) => reinspect({ sheet })}
            options={inspection.sheets.map((s) => ({ value: s, label: s }))}
          />
        )}
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          {t('map.headerRow')}
          <NumberInput
            value={inspection.header_row + 1}
            label={t('map.headerRow')}
            className="w-16"
            onCommit={(row) =>
              row !== null &&
              Number.isInteger(row) &&
              row >= 1 &&
              row - 1 !== inspection.header_row &&
              reinspect({ header_row: row - 1 })
            }
          />
        </label>
        <Select<string>
          label={t('map.nameColumn')}
          value={String(nameColumn)}
          onChange={(value) => {
            const index = Number(value)
            setNameColumn(index)
            update(index, { use: false })
          }}
          options={inspection.columns.map((c) => ({ value: String(c.index), label: c.header || `#${c.index + 1}` }))}
        />
      </div>

      {inspection.truncated && <p className="mb-3 text-xs text-amber-700">{t('map.truncated')}</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">{t('map.use')}</th>
              <th className="px-3 py-2 font-medium">{t('map.column')}</th>
              <th className="px-3 py-2 font-medium">{t('map.type')}</th>
              <th className="px-3 py-2 font-medium">{t('map.direction')}</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((column) => (
              <ColumnRow
                key={column.index}
                column={column}
                choice={choices[column.index]}
                onChange={(patch) => update(column.index, patch)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-5 mb-2 text-xs font-semibold text-slate-500">{t('map.preview')}</h3>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {header.map((h, j) => (
                <th
                  key={j}
                  className={`px-2 py-1 text-left font-medium whitespace-nowrap ${j === nameColumn ? 'text-accent-700' : ''} ${choices[j]?.use && j !== nameColumn ? '' : 'opacity-50'}`}
                >
                  {h === null ? `#${j + 1}` : String(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, i) => (
              <tr key={i} className="border-t border-slate-100">
                {header.map((_, j) => (
                  <td key={j} className="px-2 py-1 whitespace-nowrap text-slate-700">
                    {row[j] === null || row[j] === undefined ? '' : String(row[j])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && (
        <div className="mt-4">
          <ApiErrorBox error={error} />
        </div>
      )}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" icon={<X className="size-4" />} onClick={onCancel}>
          {t('map.cancel')}
        </Button>
        <Button variant="primary" icon={<Upload className="size-4" />} disabled={busy || !used.length} onClick={build}>
          {t('map.import', { n: used.length })}
        </Button>
      </div>
    </Card>
  )
}

function ColumnRow({
  column,
  choice,
  onChange,
}: {
  column: TableColumn
  choice: Choice
  onChange: (patch: Partial<Choice>) => void
}) {
  const t = useT()
  const label = column.header || `#${column.index + 1}`
  const hasCategories = choice.type === 'ordinal' || choice.type === 'categorical'
  return (
    <tr className={`border-t border-slate-100 align-top ${choice.use ? '' : 'text-slate-400'}`}>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          aria-label={`${t('map.use')}: ${label}`}
          checked={choice.use}
          onChange={(e) => onChange({ use: e.target.checked })}
          className="accent-accent-600"
        />
      </td>
      <td className="px-3 py-2">
        <div className="font-medium">{label}</div>
        <div className="text-xs text-slate-500">
          {typeLabel(t, column.detected_type)}
          {column.examples.length > 0 && ` · ${column.examples.join(', ')}`}
        </div>
      </td>
      <td className="px-3 py-2">
        <select
          aria-label={`${t('map.type')}: ${label}`}
          value={choice.type}
          disabled={!choice.use}
          onChange={(e) => onChange({ type: e.target.value as CriterionType })}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
        >
          {TYPES.map((type) => (
            <option key={type} value={type}>
              {typeLabel(t, type)}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        {choice.use && (choice.type === 'numeric' || choice.type === 'boolean') && (
          <Segmented<Direction>
            size="sm"
            value={choice.direction}
            onChange={(direction) => onChange({ direction })}
            options={[
              { value: 'benefit', label: t('common.benefit'), title: t('common.benefitHint') },
              { value: 'cost', label: t('common.cost'), title: t('common.costHint') },
            ]}
          />
        )}
        {choice.use && hasCategories && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {choice.type === 'ordinal' && <span className="text-slate-500">{t('map.order')}:</span>}
            {choice.order.map((value, i) => (
              <span key={value} className="inline-flex items-center gap-1">
                {i > 0 && choice.type === 'ordinal' && <span className="text-slate-400">→</span>}
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">{value}</span>
              </span>
            ))}
            {choice.type === 'ordinal' && (
              <Button
                variant="ghost"
                className="!px-1.5 !py-0.5 text-xs"
                icon={<ArrowLeftRight className="size-3" />}
                onClick={() => onChange({ order: [...choice.order].reverse() })}
              >
                {t('map.reverse')}
              </Button>
            )}
          </div>
        )}
      </td>
    </tr>
  )
}
