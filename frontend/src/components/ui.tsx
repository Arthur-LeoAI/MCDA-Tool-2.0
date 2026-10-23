import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'

export function Card({
  title,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent-600 text-white hover:bg-accent-700 shadow-sm',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'text-red-600 hover:bg-red-50',
}

export function Button({
  variant = 'secondary',
  icon,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  icon?: ReactNode
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (value: T) => void
  size?: 'sm' | 'md'
}) {
  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5" role="radiogroup">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          title={option.title}
          onClick={() => onChange(option.value)}
          className={`rounded-md font-medium transition ${pad} ${
            value === option.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <LoaderCircle className="size-3.5 animate-spin" />
      {label}
    </span>
  )
}

export function Badge({
  children,
  tone = 'slate',
}: {
  children: ReactNode
  tone?: 'slate' | 'green' | 'amber' | 'accent'
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    green: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    accent: 'bg-accent-50 text-accent-700 ring-1 ring-accent-100',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function PageHeader({ title, intro, actions }: { title: string; intro?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {intro && <p className="mt-1 text-sm text-slate-500">{intro}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  label?: string
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-slate-600">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="focus:border-accent-500 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
