// Friendly names for the generated API types (run `npm run gen:api` after backend changes).
import type { components } from './schema'

type Schemas = components['schemas']

export type Problem = Schemas['ProblemModel']
export type Criterion = Schemas['CriterionModel']
export type Direction = Criterion['direction']
export type WeightedSumSpec = Schemas['WeightedSumSpec']
export type TopsisSpec = Schemas['TopsisSpec']
export type CompromiseProgrammingSpec = Schemas['CompromiseProgrammingSpec']
export type MethodSpec = WeightedSumSpec | TopsisSpec | CompromiseProgrammingSpec
export type MethodName = MethodSpec['method']
export type Normalization = MethodSpec['normalization']
export type MethodResult = Schemas['MethodResultModel']
export type EvaluateResponse = Schemas['EvaluateResponse']
export type ParetoResponse = Schemas['ParetoResponse']
export type StabilityResponse = Schemas['StabilityResponse']
export type StabilityScope = StabilityResponse['scope']
export type StabilityNormalization = Schemas['StabilityOptions']['normalization']
export type Interval = Schemas['IntervalModel']
export type ImportResponse = Schemas['ImportResponse']
export type LegacyInfo = Schemas['LegacyInfo']
export type Issue = Schemas['IssueModel']
export type Location = Schemas['LocationModel']

/** A problem while it is being edited: cells may still be empty. */
export interface DraftProblem {
  alternatives: string[]
  criteria: Criterion[]
  matrix: (number | null)[][]
}
