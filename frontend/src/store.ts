import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type {
  CompromiseProgrammingMethod,
  MethodName,
  Project,
  ProjectMethod,
  StabilityScope,
  TopsisMethod,
  Weighting,
} from './api/types'
import type { Language } from './i18n/messages'

export type StepId = 'data' | 'weights' | 'results' | 'sensitivity' | 'export'
export type Mode = 'guided' | 'expert'
export type GuidedStepId = 'scenario' | 'import' | 'columns' | 'check' | 'criteria' | 'weights' | 'conclusion'

export const GUIDED_STEPS: GuidedStepId[] = [
  'scenario',
  'import',
  'columns',
  'check',
  'criteria',
  'weights',
  'conclusion',
]

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
  /** Guided wizard or the expert pages (S8); both work on the same project. */
  mode: Mode
  step: StepId
  guidedStep: GuidedStepId
  /** Template chosen in the guided scenario step; null for a blank start. */
  guidedTemplate: string | null
  project: Project | null
  /** Weighting when the project was imported or opened: for "reset" and rank changes. */
  importedWeighting: Weighting | null
  methodMemory: MethodMemory
  /** A version-1 draft from local storage, converted on start-up via the API. */
  pendingV1: Record<string, unknown> | null
  /** Local storage was full; the project is no longer saved automatically. */
  storageFull: boolean

  setLanguage: (language: Language) => void
  setStep: (step: StepId) => void
  setMode: (mode: Mode) => void
  setGuidedStep: (step: GuidedStepId) => void
  setGuidedTemplate: (templateId: string | null) => void
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
      language: 'en',
      mode: 'guided', // new users start guided; earlier versions migrate to expert below
      step: 'data',
      guidedStep: 'scenario',
      guidedTemplate: null,
      project: null,
      importedWeighting: null,
      methodMemory: defaultMethodMemory(),
      pendingV1: null,
      storageFull: false,

      setLanguage: (language) => set({ language }),
      setStep: (step) => set({ step }),
      setMode: (mode) => set({ mode }),
      setGuidedStep: (guidedStep) => set({ guidedStep }),
      setGuidedTemplate: (guidedTemplate) => set({ guidedTemplate }),
      loadProject: (project) =>
        set((s) => {
          const memory = { ...s.methodMemory }
          for (const spec of project.analysis.methods) Object.assign(memory, { [spec.method]: spec })
          const stamped = { ...project, meta: { ...project.meta, created: project.meta.created ?? timestamp() } }
          return { project: stamped, importedWeighting: project.weighting, methodMemory: memory }
        }),
      updateProject: (change) =>
        set((s) =>
          s.project ? { project: { ...change(s.project), meta: { ...s.project.meta, modified: timestamp() } } } : {},
        ),
      clear: () =>
        set({
          project: null,
          importedWeighting: null,
          step: 'data',
          guidedStep: 'scenario',
          guidedTemplate: null,
          methodMemory: defaultMethodMemory(),
        }),
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
      version: 4,
      storage: createJSONStorage(() => storage),
      partialize: (s) => ({
        language: s.language,
        mode: s.mode,
        step: s.step,
        guidedStep: s.guidedStep,
        guidedTemplate: s.guidedTemplate,
        project: s.project,
        importedWeighting: s.importedWeighting,
        methodMemory: s.methodMemory,
        pendingV1: s.pendingV1,
      }),
      migrate: (persisted, version) => migrateState(persisted, version) as unknown as State,
    },
  ),
)

/** Persisted state of an earlier version, brought to the current one. */
export function migrateState(persisted: unknown, version: number): Record<string, unknown> {
  const old = (persisted ?? {}) as Record<string, unknown>
  if (version >= 4) return old
  // Before version 4 there was only the expert interface; keep it for existing users.
  const guided = { mode: 'expert', guidedStep: 'check', guidedTemplate: null }
  return { ...(migrateV3(old, version) as object), ...guided }
}

/** Versions 1 to 3 of the persisted state, brought to version 3. */
function migrateV3(old: Record<string, unknown>, version: number): unknown {
  if (version >= 3) return old as unknown as State
  // Version 2 kept root-level weights only; the baseline is not worth converting.
  if (version === 2) return { ...old, importedWeights: undefined, importedWeighting: null } as unknown as State
  // Version 1 kept a draft problem and per-method settings; the API converts them.
  const draft = old.draft as Record<string, unknown> | null | undefined
  const settings = (old.settings ?? {}) as Record<string, Record<string, unknown>>
  const enabled = (old.enabledMethods ?? []) as string[]
  const weighted = settings.weighted_sum ?? {}
  return {
    language: (old.language as Language) ?? 'zh',
    step: 'data',
    project: null,
    importedWeighting: null,
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
}
