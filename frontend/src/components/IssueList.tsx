import { CircleAlert, WifiOff } from 'lucide-react'
import type { ApiError } from '../api/client'
import type { DraftProblem, Issue } from '../api/types'
import type { MessageKey } from '../i18n/messages'
import { useT } from '../i18n/useT'
import { readableLocation } from '../lib/problem'

/** Shows local or API validation issues, with locations users recognise. */
export function IssueList({
  issues,
  draft,
  title,
  max = 12,
}: {
  issues: Issue[]
  draft?: DraftProblem | null
  title?: string
  max?: number
}) {
  const t = useT()
  if (!issues.length) return null
  const text = (message: string) =>
    message === 'missing_value' || message === 'empty_name' ? t(`issue.${message}` as MessageKey) : message
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
      <div className="mb-1 flex items-center gap-1.5 font-medium">
        <CircleAlert className="size-4" />
        {title ?? t('issue.title', { n: issues.length })}
      </div>
      <ul className="ml-6 list-disc space-y-0.5">
        {issues.slice(0, max).map((issue, index) => {
          const location = draft ? readableLocation(issue.location, draft) : issue.location
          return (
            <li key={index}>
              {location && <span className="font-medium">{location}: </span>}
              {text(issue.message)}
            </li>
          )
        })}
        {issues.length > max && <li>… +{issues.length - max}</li>}
      </ul>
    </div>
  )
}

/** Error box for a failed API call. */
export function ApiErrorBox({ error, draft }: { error: ApiError; draft?: DraftProblem | null }) {
  const t = useT()
  if (error.status === 0) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        role="alert"
      >
        <WifiOff className="size-4 shrink-0" />
        {t('common.network')}
      </div>
    )
  }
  if (error.issues.length) return <IssueList issues={error.issues} draft={draft} title={error.message} />
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
      role="alert"
    >
      <CircleAlert className="size-4 shrink-0" />
      {error.message}
    </div>
  )
}
