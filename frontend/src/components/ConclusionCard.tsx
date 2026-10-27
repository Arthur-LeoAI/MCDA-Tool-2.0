// The conclusion in plain words (S6): recommendation, reasons, comparison, confidence, notes.
import { CircleAlert, Sparkles } from 'lucide-react'
import type { Conclusion, Project, ProjectRobustness } from '../api/types'
import { idNames, useApiPost } from '../hooks'
import { type ConclusionParagraph, conclusionParagraphs } from '../i18n/conclusion'
import type { MessageKey } from '../i18n/messages'
import { useT } from '../i18n/useT'
import { useStore } from '../store'
import { Badge, Card, Spinner } from './ui'

export function ConclusionCard({
  project,
  apiProject,
  conclusion,
}: {
  project: Project
  apiProject: Project | null
  conclusion: Conclusion
}) {
  const t = useT()
  const language = useStore((s) => s.language)
  const robustness = useApiPost<ProjectRobustness>('/projects/robustness', apiProject, 300)
  const paragraphs = conclusionParagraphs(language, conclusion, idNames(project), robustness.data)
  const level = robustness.data?.confidence.level
  const tone = { high: 'green', medium: 'amber', low: 'amber' } as const

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <Sparkles className="text-accent-600 size-4" />
          {t('concl.title')}
        </span>
      }
      actions={
        <>
          {level && (
            <Badge tone={tone[level]}>
              {t('robust.confidence')}: {t(`robust.level.${level}` as MessageKey)}
            </Badge>
          )}
          <span className="text-xs text-slate-400">{t('concl.basis')}</span>
        </>
      }
    >
      <Paragraphs paragraphs={paragraphs} />
      {robustness.loading && !robustness.data && <Spinner label={t('concl.waiting')} />}
    </Card>
  )
}

function Paragraphs({ paragraphs }: { paragraphs: ConclusionParagraph[] }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-slate-700">
      {paragraphs.map((p, i) =>
        p.kind === 'caveat' ? (
          <p key={i} className="flex items-start gap-1.5 text-amber-800">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
            {p.text}
          </p>
        ) : (
          <p key={i} className={p.kind === 'recommendation' ? 'text-base font-medium text-slate-900' : undefined}>
            {p.text}
          </p>
        ),
      )}
    </div>
  )
}
