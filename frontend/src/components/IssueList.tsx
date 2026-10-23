import { CircleAlert, WifiOff } from 'lucide-react'
import type { ApiError } from '../api/client'
import type { Issue, Project } from '../api/types'
import { describeIssue, errorText } from '../i18n/describe'
import { useT } from '../i18n/useT'
import { useStore } from '../store'

/** Shows local or API validation issues in the user's language, with recognisable locations. */
export function IssueList({
  issues,
  project,
  title,
  max = 12,
}: {
  issues: Issue[]
  project?: Project | null
  title?: string
  max?: number
}) {
  const t = useT()
  const language = useStore((s) => s.language)
  if (!issues.length) return null
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
      <div className="mb-1 flex items-center gap-1.5 font-medium">
        <CircleAlert className="size-4" />
        {title ?? t('issue.title', { n: issues.length })}
      </div>
      <ul className="ml-6 list-disc space-y-0.5">
        {issues.slice(0, max).map((issue, index) => {
          const { location, text } = describeIssue(language, issue, project)
          return (
            <li key={index}>
              {location && <span className="font-medium">{location}: </span>}
              {text}
            </li>
          )
        })}
        {issues.length > max && <li>… +{issues.length - max}</li>}
      </ul>
    </div>
  )
}

/** Error box for a failed API call. */
export function ApiErrorBox({ error, project }: { error: ApiError; project?: Project | null }) {
  const t = useT()
  const language = useStore((s) => s.language)
  if (error.code === 'network') {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        role="alert"
      >
        <WifiOff className="size-4 shrink-0" />
        {errorText(language, 'network')}
      </div>
    )
  }
  const title = errorText(language, error.code, error.params, error.message, project)
  if (error.issues.length) return <IssueList issues={error.issues} project={project} title={title} />
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
      <div className="flex items-center gap-2">
        <CircleAlert className="size-4 shrink-0" />
        {title}
      </div>
      {error.status >= 500 && error.requestId && (
        <div className="mt-1 ml-6 text-xs text-red-700/80">
          {t('common.requestId')}: <code>{error.requestId}</code>
        </div>
      )}
    </div>
  )
}
