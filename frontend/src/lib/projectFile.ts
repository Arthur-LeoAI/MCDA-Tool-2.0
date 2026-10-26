// Saving and opening .mcda.json project files (ADR 0006).
import { postJson } from '../api/client'
import type { Project } from '../api/types'

export const PROJECT_EXTENSION = '.mcda.json'

export function projectFilename(project: Project): string {
  const base = (project.meta.name || 'mcda-project').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'mcda-project'
  return `${base}${PROJECT_EXTENSION}`
}

/** Download the project as a file. Results are not stored: they are recomputed when opened. */
export function saveProjectFile(project: Project): void {
  const text = JSON.stringify({ ...project, meta: { ...project.meta, modified: new Date().toISOString() } }, null, 2)
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = projectFilename(project)
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Read a project file of any supported version; the API upgrades and checks it. */
export async function openProjectFile(file: Blob): Promise<Project> {
  let document: unknown
  try {
    document = JSON.parse(await file.text())
  } catch {
    document = null // the API answers "project_unreadable"
  }
  return postJson<Project>('/projects/migrate', document ?? {})
}

export const isProjectFile = (name: string) => name.toLowerCase().endsWith('.json')
