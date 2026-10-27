import { describe, expect, it } from 'vitest'
import { navigate, routeOf } from './router'

describe('router', () => {
  it('maps paths to the two pages', () => {
    expect(routeOf('/')).toBe('home')
    expect(routeOf('/app')).toBe('app')
    expect(routeOf('/app/')).toBe('app')
    expect(routeOf('/apple')).toBe('home')
  })

  it('navigates with the history API', () => {
    navigate('/app')
    expect(window.location.pathname).toBe('/app')
    navigate('/')
    expect(window.location.pathname).toBe('/')
  })
})
