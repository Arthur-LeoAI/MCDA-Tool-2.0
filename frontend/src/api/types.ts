// Friendly names for the generated API types (run `npm run gen:api` after backend changes).
import type { components } from './schema'

type Schemas = components['schemas']

// Project model v2 (the .mcda.json format)
export type Project = Schemas['Project']
export type Alternative = Schemas['Alternative']
export type Criterion = Schemas['Criterion']
export type CriterionType = NonNullable<Criterion['type']>
export type Direction = Schemas['LinearValueFunction']['direction']
export type ValueFunction = NonNullable<Criterion['value_function']>
export type RawValue = boolean | number | string | null
export type WeightedSumMethod = Schemas['WeightedSumMethod']
export type TopsisMethod = Schemas['TopsisMethod']
export type CompromiseProgrammingMethod = Schemas['CompromiseProgrammingMethod']
export type ProjectMethod = WeightedSumMethod | TopsisMethod | CompromiseProgrammingMethod
export type MethodName = ProjectMethod['method']

// Results
export type ProjectEvaluation = Schemas['ProjectEvaluation']
export type MethodResult = Schemas['ProjectMethodResult']
export type ProjectStability = Schemas['ProjectStability']
export type StabilityScope = ProjectStability['scope']
export type Interval = Schemas['ProjectInterval']
export type ProjectImport = Schemas['ProjectImport']

// Arbitrary tables (S2)
export type TableInspection = Schemas['TableInspection']
export type TableColumn = Schemas['TableColumn']
export type TableColumnSpec = Schemas['TableColumnSpec']
export type TableCell = TableInspection['rows'][number][number]

// Errors
export type Issue = Schemas['IssueModel']
export type Location = Schemas['LocationModel']
