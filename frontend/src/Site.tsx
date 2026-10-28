// The website: the home page at "/" and the tool at "/app".
import { lazy, Suspense, useEffect } from 'react'
import { Spinner } from './components/ui'
import { startEngine } from './engine'
import { HomePage } from './pages/HomePage'
import { useRoute } from './router'

// The tool loads on demand, so the home page stays small.
const App = lazy(() => import('./App'))

export function Site() {
  const route = useRoute()
  // The browser engine takes a while to start: begin on whichever page the visit starts.
  useEffect(startEngine, [])
  return route === 'app' ? (
    <Suspense fallback={<Spinner />}>
      <App />
    </Suspense>
  ) : (
    <HomePage />
  )
}
