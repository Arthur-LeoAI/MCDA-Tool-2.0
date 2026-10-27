// Interface words from a template (S7 terms, used by the guided mode in S8).
import type { TemplateInfo } from '../api/types'
import type { Language } from '../i18n/messages'
import { translate } from '../i18n/useT'

/**
 * What an alternative is called in running text: the template's term
 * (e.g. "产品" / "product") or the general word. English is lower-cased
 * because the templates use sentences like "one row per {alt}".
 */
export function alternativeTerm(
  language: Language,
  templates: TemplateInfo[],
  templateId: string | null | undefined,
): string {
  const term = templates.find((t) => t.id === templateId)?.terms.alternative?.[language]
  const word = term ?? translate(language, 'common.alternative')
  return language === 'en' ? word.toLowerCase() : word
}
