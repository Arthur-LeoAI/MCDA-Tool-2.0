import { describe, expect, it } from 'vitest'
import { migrateState, useStore } from './store'

describe('store', () => {
  it('starts new users in the guided mode', () => {
    expect(useStore.getState().mode).toBe('guided')
    expect(useStore.getState().guidedStep).toBe('scenario')
  })

  it('keeps users of earlier versions in the expert mode', () => {
    const migrated = migrateState({ language: 'en', step: 'results', project: null }, 3)
    expect(migrated).toMatchObject({ language: 'en', step: 'results', mode: 'expert', guidedTemplate: null })
    expect(migrateState({ mode: 'guided' }, 4)).toEqual({ mode: 'guided' })
  })

  it('switches modes without touching the project', () => {
    const project = { meta: {} } as never
    useStore.setState({ project })
    useStore.getState().setMode('expert')
    expect(useStore.getState().project).toBe(project)
    useStore.getState().setMode('guided')
    expect(useStore.getState().project).toBe(project)
  })
})
