import { useMemo, type ReactNode } from 'react'
import { SpeakButton } from './VoiceInput'
import { useLanguage } from '../contexts/LanguageContext'

const FERTILIZER_RE = /\b(?:urea|dap|mop|npk(?:\s*\d{1,2}:\d{1,2}:\d{1,2})?|potash|ammonium sulfate|ammonium sulphate|ssp|single super phosphate|vermicompost|compost|farmyard manure|fym|fertilizer|fertiliser)\b/gi
const PESTICIDE_RE = /\b(?:pesticide|pesticides|insecticide|insecticides|fungicide|fungicides|herbicide|herbicides|neem oil|azadirachtin|spinosad|emamectin|imidacloprid|chlorantraniliprole|mancozeb|copper oxychloride)\b/gi

function highlight(text: string) {
  const matches: { start: number; end: number; text: string; kind: 'fertilizer' | 'pesticide' }[] = []
  for (const [re, kind] of [[FERTILIZER_RE, 'fertilizer'], [PESTICIDE_RE, 'pesticide']] as const) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) matches.push({ start: m.index, end: m.index + m[0].length, text: m[0], kind })
  }
  matches.sort((a, b) => a.start - b.start || b.end - a.end)
  const filtered: typeof matches = []
  let cursor = -1
  for (const m of matches) {
    if (m.start >= cursor) { filtered.push(m); cursor = m.end }
  }
  const parts: ReactNode[] = []
  let pos = 0
  filtered.forEach((m, i) => {
    if (m.start > pos) parts.push(text.slice(pos, m.start))
    parts.push(<mark key={`${m.start}-${i}`} className={m.kind === 'fertilizer'
      ? 'bg-emerald-200 text-emerald-950 rounded px-1 font-semibold'
      : 'bg-amber-200 text-amber-950 rounded px-1 font-semibold'}>{m.text}</mark>)
    pos = m.end
  })
  if (pos < text.length) parts.push(text.slice(pos))
  return parts.length ? parts : [text]
}

export function RecommendationHighlights({
  recommendation,
  fertilizers = [],
  pesticides = [],
  title = 'Recommended inputs',
}: {
  recommendation?: string
  fertilizers?: string[]
  pesticides?: string[]
  title?: string
}) {
  const { language } = useLanguage()
  const allFertilizers = useMemo(() => [...new Set(fertilizers.filter(Boolean))], [fertilizers])
  const allPesticides = useMemo(() => [...new Set(pesticides.filter(Boolean))], [pesticides])
  if (!recommendation && !allFertilizers.length && !allPesticides.length) return null

  const speechText = [
    recommendation,
    allFertilizers.length ? `Recommended fertilizers: ${allFertilizers.join(', ')}.` : '',
    allPesticides.length ? `Recommended pesticides: ${allPesticides.join(', ')}.` : '',
  ].filter(Boolean).join(' ')

  return (
    <div className="rounded-xl border border-field-200 bg-field-50/60 p-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-xs font-bold text-field-800 uppercase">🌱 {title}</p>
        <SpeakButton text={speechText} language={language} />
      </div>
      {recommendation && <p className="text-sm text-gray-700 leading-relaxed">{highlight(recommendation)}</p>}
      {(allFertilizers.length > 0 || allPesticides.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
          {allFertilizers.length > 0 && <div className="rounded-lg bg-emerald-100/80 p-2">
            <p className="text-[10px] font-bold text-emerald-800 uppercase">🌿 Fertilizers</p>
            <ul className="text-sm text-emerald-950 list-disc pl-4 mt-1">{allFertilizers.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>}
          {allPesticides.length > 0 && <div className="rounded-lg bg-amber-100/80 p-2">
            <p className="text-[10px] font-bold text-amber-800 uppercase">🧪 Pesticides / medicines</p>
            <ul className="text-sm text-amber-950 list-disc pl-4 mt-1">{allPesticides.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>}
        </div>
      )}
      <p className="text-[10px] text-gray-500 mt-2">Highlighted items are the fertilizer/pesticide terms detected in the recommendation. Follow the product label and local agricultural guidance.</p>
    </div>
  )
}
