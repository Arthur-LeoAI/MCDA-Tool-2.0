import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type {
  CompromiseProgrammingMethod,
  MethodName,
  Project,
  ProjectMethod,
  StabilityScope,
  TopsisMethod,
} from './api/types'
import type { Language } from './i18n/messages'
import { weightsOf } from './lib/project'

export type StepId = 'data' | 'weights' | 'results' | 'sensitivity' | 'export'

export const METHOD_NAMES: MethodName[] = ['weighted_sum', 'topsis', 'compromise_programming']

/** Settings to use when a method is switched on again. */
export interface MethodMemory {
  weighted_sum: { method: 'weighted_sum' }
  topsis: TopsisMethod
  compromise_programming: CompromiseProgrammingMethod
}

const defaultMethodMemory = (): MethodMemory => ({
  weighted_sum: { method: 'weighted_sum' },
  topsis: { method: 'topsis', basis: 'values', ideal: 'data' },
  compromise_programming: { method: 'compromise_programming', p: 2, ideal: 'data' },
})

const timestamp = () => new Date().toISOString()

interface State {
  language: Language
  step: StepId
  project: Project | null
  /** Weights when the project was imported or opened: for "reset" and rank changes. */
  importedWeights: Record<string, number> | null
  methodMemory: MethodMemory
  /** A version-1 draft from local storage, converted on start-up via the API. */
  pendingV1: Record<string, unknown> | null
  /** Local storage was full; the project is no longer saved automatically. */
  storageFull: boolean

  setLanguage: (language: Language) => void
  setStep: (step: StepId) => void
  loadProject: (project: Project) => void
  updateProject: (change: (project: Project) => Project) => void
  clear: () => void
  toggleMethod: (method: MethodName) => void
  setMethod: (spec: ProjectMethod) => void
  setStabilityScope: (scope: StabilityScope) => void
  resolvePendingV1: () => void
}

const withMethods = (project: Project, methods: ProjectMethod[]): Project => ({
  ...project,
  analysis: { ...project.analysis, methods },
})

/** localStorage that reports a full quota instead of throwing. */
const storage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value)
      if (useStore.getState().storageFull) useStore.setState({ storageFull: false })
    } catch {
      useStore.setState({ storageFull: true })
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name)
    } catch {
      // nothing to clean up
    }
  },
}

export const useStore = create<State>()(
  persist(
    (set) => ({
      language: 'zh',
      step: 'data',
      project: null,
      importedWeights: null,
      methodMemory: defaultMethodMemory(),
      pendingV1: null,
      storageFull: false,

      setLanguage: (language) => set({ language }),
      setStep: (step) => set({ step }),
      loadProject: (project) =>
        set((s) => {
          const memory = { ...s.methodMemory }
          for (const spec of project.analysis.methods) Object.assign(memory, { [spec.method]: spec })
          const stamped = { ...project, meta: { ...project.meta, created: project.meta.created ?? timestamp() } }
          return { project: stamped, importedWeights: { ...weightsOf(project) }, methodMemory: memory }
        }),
      updateProject: (change) =>
        set((s) =>
          s.project ? { project: { ...change(s.project), meta: { ...s.project.meta, modified: timestamp() } } } : {},
        ),
      clear: () => set({ project: null, importedWeights: null, step: 'data', methodMemory: defaultMethodMemory() }),
      toggleMethod: (method) =>
        set((s) => {
          if (!s.project) return {}
          const methods = s.project.analysis.methods
          const enabled = methods.some((m) => m.method === method)
          if (enabled && methods.length === 1) return {} // at least one method stays on
          const next = enabled
            ? methods.filter((m) => m.method !== method)
            : METHOD_NAMES.flatMap((name) =>
                name === method ? [s.methodMemory[name]] : methods.filter((m) => m.method === name),
              )
          return { project: withMethods(s.project, next) }
        }),
      setMethod: (spec) =>
        set((s) => ({
          methodMemory: { ...s.methodMemory, [spec.method]: spec },
          project: s.project
            ? withMethods(
                s.project,
                s.project.analysis.methods.map((m) => (m.method === spec.method ? spec : m)),
              )
            : null,
        })),
      setStabilityScope: (scope) =>
        set((s) =>
          s.project ? { project: { ...s.project, analysis: { ...s.project.analysis, stability_scope: scope } } } : {},
        ),
      resolvePendingV1: () => set({ pendingV1: null }),
    }),
    {
      name: 'mcda-workspace',
      version: 2,
      storage: createJSONStorage(() => storage),
      partialize: (s) => ({
        language: s.language,
        step: s.step,
        project: s.project,
        importedWeights: s.importedWeights,
        methodMemory: s.methodMemory,
        pendingV1: s.pendingV1,
      }),
      migrate: (persisted, version) => {
        const old = (persisted ?? {}) as Record<string, unknown>
        if (version >= 2) return old as unknown as State
        // Version 1 kept a draft problem and per-method settings; the API converts them.
        const draft = old.draft as Record<string, unknown> | null | undefined
        const settings = (old.settings ?? {}) as Record<string, Record<string, unknown>>
        const enabled = (old.enabledMethods ?? []) as string[]
        const weighted = settings.weighted_sum ?? {}
        return {
          language: (old.language as Language) ?? 'zh',
          step: 'data',
          project: null,
          importedWeights: null,
          methodMemory: defaultMethodMemory(),
          pendingV1: draft
            ? {
                ...draft,
                normalization: weighted.normalization,
                bounds: weighted.bounds,
                methods: enabled.map((m) => settings[m]).filter(Boolean),
              }
            : null,
        } as unknown as State
      },
    },
  ),
)
