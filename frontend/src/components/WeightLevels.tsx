// All weighting levels of a project (S4): between groups, then each group's criteria.
// Shared by the expert weights page and the guided weights step (S8).
import { Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Project, ProjectWeights } from '../api/types'
import { useApiPost } from '../hooks'
import { useT } from '../i18n/useT'
import { GROUPS, ROOT, levelOf, removeGroup, renameGroup, setLevel, structure } from '../lib/weighting'
import { ApiErrorBox } from './IssueList'
import { WeightLevel, type LevelItem } from './WeightLevel'
import { Button, Card } from './ui'

export function WeightLevels({
  project,
  apiProject,
  update,
  visible,
  controls,
  details,
}: {
  project: Project
  apiProject: Project | null
  update: (change: (project: Project) => Project) => void
  /** Filter for the criteria rows of direct levels (search, hide zero). */
  visible?: (item: LevelItem, overall: Record<string, number> | undefined) => boolean
  controls?: (id: string) => ReactNode
  details?: (id: string) => ReactNode
}) {
  const t = useT()
  const weights = useApiPost<ProjectWeights>('/projects/weights', apiProject, 150)
  const { upper, lower } = structure(project)
  const groups = project.groups ?? []
  const criteria = new Map(project.criteria.map((c) => [c.id, c]))
  const resultOf = (key: string) => weights.data?.levels.find((l) => l.key === key)
  const groupName = (id: string) =>
    id === ROOT ? t('groups.ungrouped') : (groups.find((g) => g.id === id)?.name ?? id)
  const emptyGroups = groups.filter((g) => !(g.id in lower))

  const criterionItems = (ids: string[]): LevelItem[] =>
    ids.map((id) => ({ id, name: criteria.get(id)!.name, global: upper ? weights.data?.weights[id] : undefined }))

  const groupActions = (id: string) =>
    id !== ROOT && (
      <>
        <input
          value={groupName(id)}
          aria-label={`${t('groups.rename')}: ${groupName(id)}`}
          onChange={(e) => update((p) => renameGroup(p, id, e.target.value))}
          className="focus:border-accent-500 w-40 rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none"
        />
        <Button
          variant="danger"
          className="!p-1.5"
          aria-label={`${t('groups.remove')}: ${groupName(id)}`}
          title={t('groups.remove')}
          icon={<Trash2 className="size-4" />}
          onClick={() => update((p) => removeGroup(p, id))}
        />
      </>
    )

  return (
    <div className="space-y-6">
      {weights.error && <ApiErrorBox error={weights.error} project={project} />}

      {upper && (
        <WeightLevel
          title={t('groups.upper')}
          items={upper.map((id) => ({ id, name: groupName(id) }))}
          level={levelOf(project, GROUPS, upper)}
          result={resultOf(GROUPS)}
          onChange={(level) => update((p) => setLevel(p, GROUPS, level))}
        />
      )}

      {Object.entries(lower).map(([key, ids]) => (
        <WeightLevel
          key={key}
          title={upper ? groupName(key) : t('weights.criteria')}
          actions={upper && groupActions(key)}
          items={criterionItems(ids)}
          level={levelOf(project, key, ids)}
          result={resultOf(`within.${key}`)}
          onChange={(level) => update((p) => setLevel(p, key, level))}
          visible={visible && ((item) => visible(item, weights.data?.weights))}
          controls={controls}
          details={details}
        />
      ))}

      {emptyGroups.map((g) => (
        <Card key={g.id} title={g.name} actions={groupActions(g.id)}>
          <p className="text-sm text-slate-500">{t('groups.empty')}</p>
        </Card>
      ))}
    </div>
  )
}
