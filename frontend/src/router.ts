// Two pages need no router library: the home page at "/" and the tool at "/app".
import { useSyncExternalStore } from 'react'

export type Route = 'home' | 'app'

export const APP_PATH = '/app'

export const routeOf = (path: string): Route => (path === APP_PATH || path.startsWith(`${APP_PATH}/`) ? 'app' : 'home')

const subscribe = (onChange: () => void) => {
  window.addEventListener('popstate', onChange)
  return () => window.removeEventListener('popstate', onChange)
}

export function useRoute(): Route {
  return routeOf(useSyncExternalStore(subscribe, () => window.location.pathname))
}

/** Go to a path without reloading the page (the back button still works). */
export function navigate(path: string): void {
  if (window.location.pathname === path) return
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo({ top: 0 })
}
