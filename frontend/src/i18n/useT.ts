import { useCallback } from 'react'
import { useStore } from '../store'
import { type Language, type MessageKey, messages } from './messages'

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

export function translate(language: Language, key: MessageKey, vars?: Record<string, string | number>): string {
  const text = messages[language][key] ?? key
  return vars ? text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`)) : text
}

export function useT(): Translate {
  const language = useStore((s) => s.language)
  return useCallback((key, vars) => translate(language, key, vars), [language])
}
