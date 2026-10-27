// Conclusion sentences from the structured points (S6, ADR 0007): fixed templates, no language model.
import type { Conclusion, ProjectRobustness } from '../api/types'
import { errorText } from './describe'
import type { Language, MessageKey } from './messages'
import { translate } from './useT'

/** Score gaps below this many points (of 100) are called small. */
export const CLOSE_GAP = 1

export interface ConclusionParagraph {
  kind: 'recommendation' | 'reasons' | 'versus' | 'confidence' | 'caveat'
  text: string
}

const points = (value: number) => Math.abs(value).toFixed(1)

/**
 * The conclusion as paragraphs. `names` maps alternative and criterion ids to names;
 * `robustness` is optional because it is computed separately (and more slowly).
 */
export function conclusionParagraphs(
  language: Language,
  conclusion: Conclusion,
  names: Map<string, string>,
  robustness?: ProjectRobustness | null,
): ConclusionParagraph[] {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(language, key, vars)
  const name = (id: string) => names.get(id) ?? id
  const list = (shares: Conclusion['advantages']) =>
    shares
      .map((s) => t('concl.item', { criterion: name(s.criterion_id), points: points(s.points) }))
      .join(t('concl.separator'))

  const winner = name(conclusion.winner.id)
  const runner = name(conclusion.runner_up.id)
  const score = conclusion.winner.score.toFixed(1)
  const gap = conclusion.score_gap.toFixed(1)
  const paragraphs: ConclusionParagraph[] = []

  const tied = conclusion.tied.length > 0
  const recommendation = tied
    ? t('concl.tied', { winner, others: conclusion.tied.map(name).join(t('concl.separator')), score })
    : conclusion.score_gap < CLOSE_GAP
      ? t('concl.close', { winner, score, runner, gap })
      : t('concl.recommend', { winner, score, runner, gap })
  paragraphs.push({ kind: 'recommendation', text: recommendation })

  if (conclusion.top_contributions.length) {
    paragraphs.push({ kind: 'reasons', text: t('concl.reasons', { winner, list: list(conclusion.top_contributions) }) })
  }

  if (!tied && conclusion.advantages.length) {
    const adv = list(conclusion.advantages)
    const text = conclusion.disadvantages.length
      ? t('concl.versus', { winner, runner, adv, dis: list(conclusion.disadvantages) })
      : t('concl.versusNoDis', { winner, runner, adv })
    paragraphs.push({ kind: 'versus', text })
  }

  if (robustness) {
    const c = robustness.confidence
    const mode = t(robustness.settings.mode === 'unknown' ? 'concl.modeUnknown' : 'concl.modeAround')
    paragraphs.push({
      kind: 'confidence',
      text: t('concl.confidence', {
        level: t(`robust.level.${c.level}` as MessageKey),
        mode,
        samples: (robustness.settings.samples ?? 0).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US'),
        name: name(c.id),
        p: `${(c.p_best * 100).toFixed(1)}%`,
      }),
    })
  }

  for (const caveat of conclusion.caveats) {
    const text = errorText(language, caveat.code, caveat.params, caveat.message)
    paragraphs.push({ kind: 'caveat', text: t('concl.caveat', { text }) })
  }
  return paragraphs
}
