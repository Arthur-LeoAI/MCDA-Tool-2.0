import { useEffect, useMemo, useState } from 'react'
import { type ApiError, asApiError, postJson } from './api/client'
import type { Project, ProjectEvaluation, ProjectRobustness } from './api/types'
import { conclusionParagraphs } from './i18n/conclusion'
import { forApi, localIssues } from './lib/project'
import { useStore } from './store'

interface ApiState<T> {
  data: T | null
  error: ApiError | null
  loading: boolean
}

/**
 * POST `body` to `path` whenever it changes (debounced; stale requests are
 * aborted). Pass `null` to skip the request. While a new request runs, the
 * previous data stays available so views do not flicker.
 */
export function useApiPost<T>(path: string, body: unknown, delay = 250): ApiState<T> {
  const key = body === null ? null : `${path}\n${JSON.stringify(body)}`
  const [settled, setSettled] = useState<{ key: string | null; data: T | null; error: ApiError | null }>({
    key: null,
    data: null,
    error: null,
  })

  useEffect(() => {
    if (key === null) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      postJson<T>(path, body, controller.signal)
        .then((data) => setSettled({ key, data, error: null }))
        .catch((error: Error) => {
          if (error.name === 'AbortError') return
          setSettled({ key, data: null, error: asApiError(error) })
        })
    }, delay)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
    // `key` captures `body`; listing `body` would refire on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key, delay])

  if (key === null) return { data: null, error: null, loading: false }
  const fresh = settled.key === key
  return { data: settled.data, error: fresh ? settled.error : null, loading: !fresh }
}

/**
 * The current project with local checks. `apiProject` is the project ready
 * to send to the API, or null while local issues (e.g. empty names) remain.
 */
export function useCheckedProject() {
  const project = useStore((s) => s.project)
  return useMemo(() => {
    if (!project) return null
    const issues = localIssues(project)
    return { project, issues, apiProject: issues.length ? null : forApi(project) }
  }, [project])
}

/** Converts a draft saved by version 3 of the app (once, on start-up). */
export function useMigratePendingDraft() {
  const pending = useStore((s) => s.pendingV1)
  const [error, setError] = useState<ApiError | null>(null)
  useEffect(() => {
    if (!pending) return
    postJson<Project>('/projects/migrate', pending)
      .then((project) => useStore.getState().loadProject(project))
      .catch((err) => setError(asApiError(err)))
      .finally(() => useStore.getState().resolvePendingV1())
  }, [pending])
  return { migrating: pending !== null, error }
}

/** Names of alternatives and criteria by id. */
export const idNames = (project: Project) =>
  new Map([...project.alternatives, ...project.criteria].map((item) => [item.id, item.name] as const))

/** Evaluation and robustness of a project, and the conclusion written from them (S6). */
export function useConclusion(project: Project, apiProject: Project | null) {
  const language = useStore((s) => s.language)
  const evaluation = useApiPost<ProjectEvaluation>('/projects/evaluate', apiProject)
  const robustness = useApiPost<ProjectRobustness>('/projects/robustness', apiProject, 300)
  const conclusion = evaluation.data?.conclusion
  const paragraphs = conclusion ? conclusionParagraphs(language, conclusion, idNames(project), robustness.data) : []
  return { evaluation, robustness, paragraphs }
}
