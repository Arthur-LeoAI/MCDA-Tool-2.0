import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type {
  CompromiseProgrammingSpec,
  DraftProblem,
  ImportResponse,
  LegacyInfo,
  MethodName,
  MethodSpec,
  StabilityScope,
  TopsisSpec,
  WeightedSumSpec,
} from './api/types'
import type { Language } from './i18n/messages'
import { draftFromProblem } from './lib/problem'

export type StepId = 'data' | 'weights' | 'results' | 'sensitivity' | 'export'

export interface MethodSettings {
  weighted_sum: WeightedSumSpec
  topsis: TopsisSpec
  compromise_programming: CompromiseProgrammingSpec
}

export const METHOD_NAMES: MethodName[] = ['weighted_sum', 'topsis', 'compromise_programming']

const defaultSettings = (): MethodSettings => ({
  weighted_sum: { method: 'weighted_sum', normalization: 'min_max', bounds: [0, 100] },
  topsis: { method: 'topsis', normalization: 'vector', bounds: [0, 100] },
  compromise_programming: { method: 'compromise_programming', p: 2, normalization: 'min_max', bounds: [0, 100] },
})

interface Source {
  filename: string
  format: 'template' | 'legacy'
  legacy: LegacyInfo | null
}

interface State {
  language: Language
  step: StepId
  draft: DraftProblem | null
  source: Source | null
  importedWeights: number[] | null
  settings: MethodSettings
  enabledMethods: MethodName[]
  stabilityScope: StabilityScope

  setLanguage: (language: Language) => void
  setStep: (step: StepId) => void
  loadImport: (response: ImportResponse) => void
  updateDraft: (change: (draft: DraftProblem) => DraftProblem) => void
  clear: () => void
  setMethodSettings: <M extends MethodName>(method: M, patch: Partial<MethodSettings[M]>) => void
  toggleMethod: (method: MethodName) => void
  setStabilityScope: (scope: StabilityScope) => void
}

export const useStore = create<State>()(
  persist(
    (set) => ({
      language: 'zh',
      step: 'data',
      draft: null,
      source: null,
      importedWeights: null,
      settings: defaultSettings(),
      enabledMethods: [...METHOD_NAMES],
      stabilityScope: 'full_order',

      setLanguage: (language) => set({ language }),
      setStep: (step) => set({ step }),
      loadImport: (response) => {
        const settings = defaultSettings()
        // Legacy values are pre-scaled to 0-100; 'none' reproduces the workbook's ranking.
        if (response.source_format === 'legacy') settings.weighted_sum.normalization = 'none'
        set({
          draft: draftFromProblem(response.problem),
          source: { filename: response.filename, format: response.source_format, legacy: response.legacy ?? null },
          importedWeights: response.problem.criteria.map((c) => c.weight),
          settings,
        })
      },
      updateDraft: (change) => set((s) => (s.draft ? { draft: change(s.draft) } : {})),
      clear: () => set({ draft: null, source: null, importedWeights: null, step: 'data', settings: defaultSettings() }),
      setMethodSettings: (method, patch) =>
        set((s) => ({ settings: { ...s.settings, [method]: { ...s.settings[method], ...patch } } })),
      toggleMethod: (method) =>
        set((s) => ({
          enabledMethods: s.enabledMethods.includes(method)
            ? s.enabledMethods.filter((m) => m !== method)
            : METHOD_NAMES.filter((m) => m === method || s.enabledMethods.includes(m)),
        })),
      setStabilityScope: (stabilityScope) => set({ stabilityScope }),
    }),
    {
      name: 'mcda-workspace',
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
)

export const selectEnabledSpecs = (s: Pick<State, 'settings' | 'enabledMethods'>): MethodSpec[] =>
  s.enabledMethods.map((m) => s.settings[m])
