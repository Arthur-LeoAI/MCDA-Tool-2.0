// Home page of the website: what the tool does, for whom, and how data are handled.
import {
  ArrowRight,
  BarChart3,
  Compass,
  FileSpreadsheet,
  FlaskConical,
  Languages,
  LineChart,
  ListOrdered,
  MessageSquareText,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Table2,
  Building2,
  Wrench,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { type ApiError, asApiError, getJson } from '../api/client'
import type { Project } from '../api/types'
import { ApiErrorBox } from '../components/IssueList'
import { Spinner } from '../components/ui'
import type { MessageKey } from '../i18n/messages'
import { useT } from '../i18n/useT'
import { APP_PATH, navigate } from '../router'
import { useStore } from '../store'

const EXAMPLE_TEMPLATE = 'amazon-us-product-selection'

const STEPS: { icon: typeof Table2; key: '1' | '2' | '3' | '4' }[] = [
  { icon: Table2, key: '1' },
  { icon: Compass, key: '2' },
  { icon: ListOrdered, key: '3' },
  { icon: MessageSquareText, key: '4' },
]

const FEATURES: { icon: typeof Table2; key: string }[] = [
  { icon: FileSpreadsheet, key: 'import' },
  { icon: LineChart, key: 'scoring' },
  { icon: ListOrdered, key: 'weights' },
  { icon: BarChart3, key: 'robust' },
  { icon: MessageSquareText, key: 'conclusion' },
  { icon: FileSpreadsheet, key: 'export' },
]

const SCENARIOS: { icon: typeof Table2; key: string }[] = [
  { icon: ShoppingCart, key: 'amazon' },
  { icon: FlaskConical, key: 'research' },
  { icon: Building2, key: 'business' },
]

export function HomePage() {
  const t = useT()
  const { language, setLanguage, project, loadProject, setMode, setGuidedStep, setGuidedTemplate } = useStore()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
    document.title = `${t('app.title')} · MCDA`
  }, [language, t])

  /** Open the tool in the guided mode, at its first step. */
  const start = () => {
    setMode('guided')
    setGuidedStep(project ? 'check' : 'scenario')
    navigate(APP_PATH)
  }

  /** Load the Amazon example and open it at the check step of the guided mode. */
  const tryExample = async () => {
    setBusy(true)
    setError(null)
    try {
      const query = new URLSearchParams({ language, example: 'true' })
      loadProject(await getJson<Project>(`/templates/${EXAMPLE_TEMPLATE}/project?${query}`))
      setGuidedTemplate(EXAMPLE_TEMPLATE)
      setMode('guided')
      setGuidedStep('check')
      navigate(APP_PATH)
    } catch (err) {
      setError(asApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const anchor = (id: string, label: MessageKey) => (
    <a href={`#${id}`} className="hidden text-sm text-slate-600 hover:text-slate-900 md:inline">
      {t(label)}
    </a>
  )

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <a href="/" className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" className="size-7" />
            <span className="text-sm font-semibold text-slate-900">{t('app.title')}</span>
          </a>
          <nav className="flex items-center gap-5">
            {anchor('how', 'home.nav.how')}
            {anchor('features', 'home.nav.features')}
            {anchor('scenarios', 'home.nav.scenarios')}
            {anchor('privacy', 'home.nav.privacy')}
            <button
              type="button"
              onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              <Languages className="size-4" />
              {t('lang.switch')}
            </button>
            <a
              href={APP_PATH}
              onClick={(e) => {
                e.preventDefault()
                start()
              }}
              className="bg-accent-600 hover:bg-accent-700 rounded-lg px-3 py-1.5 text-sm font-medium text-white shadow-sm"
            >
              {t('home.open')}
            </a>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="from-accent-50 bg-gradient-to-b to-white">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-[1.2fr_1fr] md:py-24">
            <div>
              <h1 className="text-3xl leading-tight font-bold text-slate-900 md:text-4xl">{t('home.hero.title')}</h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600">{t('home.hero.text')}</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={start}
                  className="bg-accent-600 hover:bg-accent-700 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
                >
                  {project ? t('home.hero.continue') : t('home.hero.start')}
                  <ArrowRight className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={tryExample}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Sparkles className="text-accent-600 size-4" />
                  {t('home.hero.example')}
                </button>
                {busy && <Spinner />}
              </div>
              <p className="mt-4 text-xs text-slate-500">{t('home.hero.facts')}</p>
              {error && (
                <div className="mt-4 max-w-xl">
                  <ApiErrorBox error={error} />
                </div>
              )}
            </div>
            <PreviewCard />
          </div>
        </section>

        <Section id="how" title={t('home.how.title')}>
          <ol className="grid gap-6 md:grid-cols-4">
            {STEPS.map(({ icon: Icon, key }, i) => (
              <li key={key} className="relative">
                <div className="bg-accent-600 mb-3 flex size-9 items-center justify-center rounded-full text-sm font-semibold text-white">
                  {i + 1}
                </div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Icon className="text-accent-600 size-4" />
                  {t(`home.how.${key}.title` as MessageKey)}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  {t(`home.how.${key}.text` as MessageKey)}
                </p>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="features" title={t('home.features.title')} tinted>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, key }) => (
              <div key={key} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <Icon className="text-accent-600 mb-3 size-5" />
                <h3 className="text-sm font-semibold text-slate-900">{t(`home.f.${key}.title` as MessageKey)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t(`home.f.${key}.text` as MessageKey)}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="scenarios" title={t('home.scenarios.title')}>
          <div className="grid gap-4 md:grid-cols-3">
            {SCENARIOS.map(({ icon: Icon, key }) => (
              <div key={key} className="rounded-xl border border-slate-200 p-5">
                <Icon className="text-accent-600 mb-3 size-5" />
                <h3 className="text-sm font-semibold text-slate-900">{t(`home.s.${key}.title` as MessageKey)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t(`home.s.${key}.text` as MessageKey)}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <ModeCard icon={Compass} title={t('home.modes.guidedTitle')} text={t('home.modes.guided')} />
            <ModeCard icon={Wrench} title={t('home.modes.expertTitle')} text={t('home.modes.expert')} />
          </div>
        </Section>

        <Section id="privacy" title={t('home.privacy.title')} tinted>
          <ul className="grid gap-4 md:grid-cols-3">
            {(['1', '2', '3'] as const).map((n) => (
              <li key={n} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
                <ShieldCheck className="size-5 shrink-0 text-emerald-600" />
                {t(`home.privacy.${n}` as MessageKey)}
              </li>
            ))}
          </ul>
        </Section>

        <section className="mx-auto max-w-6xl px-4 py-16 text-center">
          <h2 className="text-2xl font-bold text-slate-900">{t('home.hero.title')}</h2>
          <button
            type="button"
            onClick={start}
            className="bg-accent-600 hover:bg-accent-700 mt-6 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
          >
            {project ? t('home.hero.continue') : t('home.hero.start')}
            <ArrowRight className="size-4" />
          </button>
        </section>
      </main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-slate-500">
          <span>
            {t('app.title')} · {t('app.subtitle')}
          </span>
          <span>{t('home.footer.license')}</span>
        </div>
      </footer>
    </div>
  )
}

function Section({
  id,
  title,
  tinted = false,
  children,
}: {
  id: string
  title: string
  tinted?: boolean
  children: React.ReactNode
}) {
  return (
    <section id={id} className={`scroll-mt-14 ${tinted ? 'bg-slate-50' : ''}`}>
      <div className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="mb-8 text-2xl font-bold text-slate-900">{title}</h2>
        {children}
      </div>
    </section>
  )
}

function ModeCard({ icon: Icon, title, text }: { icon: typeof Table2; title: string; text: string }) {
  return (
    <div className="border-accent-100 bg-accent-50/50 flex gap-3 rounded-xl border p-5">
      <Icon className="text-accent-600 size-5 shrink-0" />
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{text}</p>
      </div>
    </div>
  )
}

/** A static illustration of a result, clearly marked as an example. */
function PreviewCard() {
  const t = useT()
  const bars = [
    { name: 'C', score: 78 },
    { name: 'A', score: 66 },
    { name: 'D', score: 51 },
    { name: 'B', score: 43 },
  ]
  return (
    <div aria-hidden className="rounded-2xl border border-slate-200 bg-white p-5 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Sparkles className="text-accent-600 size-4" />
          {t('home.preview.title')}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{t('home.preview.label')}</span>
      </div>
      <p className="text-sm leading-relaxed text-slate-700">{t('home.preview.text')}</p>
      <p className="mt-2 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
        {t('home.preview.confidence')}
      </p>
      <ol className="mt-4 space-y-2">
        {bars.map((bar, i) => (
          <li key={bar.name} className="flex items-center gap-2 text-xs">
            <span
              className={`flex size-5 items-center justify-center rounded-full font-semibold ${i === 0 ? 'bg-accent-600 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              {i + 1}
            </span>
            <span className="w-14 text-slate-600">
              {t('common.alternative')} {bar.name}
            </span>
            <span className="h-2 flex-1 rounded-full bg-slate-100">
              <span className="bg-accent-500 block h-2 rounded-full" style={{ width: `${bar.score}%` }} />
            </span>
            <span className="w-6 text-right text-slate-500 tabular-nums">{bar.score}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
