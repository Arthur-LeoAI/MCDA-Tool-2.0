import { CircleCheck, TriangleAlert } from 'lucide-react'
import type { Issue, Project } from '../api/types'
import { useApiPost } from '../hooks'
import { describeIssue } from '../i18n/describe'
import type { MessageKey } from '../i18n/messages'
import { useT } from '../i18n/useT'
import { useStore } from '../store'
import { Spinner } from './ui'

/** Data quality findings from the API; informational, they never block the analysis. */
export function QualityPanel({ project }: { project: Project | null }) {
  const t = useT()
  const language = useStore((s) => s.language)
  const quality = useApiPost<Issue[]>('/projects/quality', project, 600)
  const findings = quality.data ?? []

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
        {t('quality.title')}
        {quality.loading && <Spinner />}
      </div>
      {findings.length === 0 ? (
        quality.data && (
          <p className="flex items-center gap-1.5 text-sm text-emerald-700">
            <CircleCheck className="size-4" />
            {t('quality.ok')}
          </p>
        )
      ) : (
        <>
          <p className="mb-2 text-xs text-slate-500">{t('quality.hint')}</p>
          <ul className="space-y-1 text-sm text-slate-700">
            {findings.map((finding, i) => {
              // The missing-value policy arrives as a code; show it in words.
              const policy = finding.params.policy
              const params = policy
                ? { ...finding.params, policy: t(`missing.${policy}` as MessageKey) }
                : finding.params
              const { location, text } = describeIssue(language, { ...finding, params }, project)
              return (
                <li key={i} className="flex gap-2">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
                  <span>
                    {location && <span className="font-medium">{location}: </span>}
                    {text}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
