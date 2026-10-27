// The website: the home page at "/" and the tool at "/app".
import { lazy, Suspense } from 'react'
import { Spinner } from './components/ui'
import { HomePage } from './pages/HomePage'
import { useRoute } from './router'

// The tool loads on demand, so the home page stays small.
const App = lazy(() => import('./App'))

export function Site() {
  const route = useRoute()
  return route === 'app' ? (
    <Suspense fallback={<Spinner />}>
      <App />
    </Suspense>
  ) : (
    <HomePage />
  )
}
