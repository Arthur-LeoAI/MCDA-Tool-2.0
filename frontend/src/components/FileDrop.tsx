import { FileSpreadsheet } from 'lucide-react'
import { useRef, useState } from 'react'
import { useT } from '../i18n/useT'
import { Spinner } from './ui'

export function FileDrop({ onFile, busy }: { onFile: (file: File) => void; busy: boolean }) {
  const t = useT()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const file = e.dataTransfer.files[0]
        if (file) onFile(file)
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center transition ${
        over ? 'border-accent-500 bg-accent-50' : 'hover:border-accent-500 border-slate-300 bg-slate-50 hover:bg-white'
      }`}
    >
      <FileSpreadsheet className="text-accent-500 size-10" />
      {busy ? (
        <Spinner label={t('data.uploading')} />
      ) : (
        <>
          <div className="font-medium text-slate-700">{t('data.drop')}</div>
          <div className="text-xs text-slate-500">{t('data.dropHint')}</div>
        </>
      )}
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xlsm,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
