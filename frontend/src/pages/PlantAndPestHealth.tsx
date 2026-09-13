import { useEffect, useRef, useState } from 'react'
import { analyzePlant, getPlantHistory } from '../services/api'
import { Card, Button, Spinner, StatusPill } from '../components/UI'
import { useLanguage } from '../contexts/LanguageContext'
import { usePageContext } from '../contexts/PageContext'
import { RecommendationHighlights } from '../components/RecommendationHighlights'

/**
 * Splits a paragraph of prose into individual points for display as a
 * bulleted list, instead of one dense block of text.
 *
 * Kindwise crop.health returns symptoms/recommendation/prevention as plain
 * prose strings (sometimes one long sentence, sometimes several run
 * together) — there is no structured field to read points from. Rather
 * than change what the backend stores or returns (out of scope — this is a
 * display-only readability change), this splits on sentence boundaries and
 * existing line breaks, so multi-idea text reads as a scannable list while
 * a single short sentence still renders as a single, normal-looking line.
 */
function toPoints(text?: string): string[] {
  if (!text) return []
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
}

/** One labelled section of the result, rendered as bullet points when there
 * is more than one point, or a single line when there's just one — a lone
 * short sentence doesn't need a bullet in front of it to be "structured". */
function PointSection({ label, text }: { label: string; text?: string }) {
  const points = toPoints(text)
  if (points.length === 0) return null
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{label}</p>
      {points.length > 1 ? (
        <ul className="text-sm text-gray-700 list-disc pl-4 space-y-1">
          {points.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      ) : (
        <p className="text-sm text-gray-700">{points[0]}</p>
      )}
    </div>
  )
}

/**
 * Plant Health — upload a photo, get an AI reading of what's wrong with the
 * crop (or confirmation it's healthy), with symptoms, a recommendation and
 * prevention advice broken out as clear, scannable points rather than one
 * dense paragraph.
 *
 * This page previously also housed a separate Pest Management tab (photo →
 * pest ID → IPM treatment plan). That tab has been removed from here by
 * request — Plant Health's own analysis, history and formatting are
 * unchanged; only the pest-specific tab and its UI are gone.
 */
export default function PlantAndPestHealth() {
  const { t, language } = useLanguage()
  const { publish } = usePageContext()

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [crop, setCrop] = useState('')
  const [result, setResult] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const loadHistory = () => getPlantHistory().then((h) => {
    setHistory(h)
    if (!result) publish('Plant Health',
      `${h.length} past diagnosis/diagnoses on record.` +
      (h[0] ? ` Most recent: ${h[0].crop} — ${h[0].disease} (${h[0].severity}).` : ''))
  }).catch(() => {})
  useEffect(() => { loadHistory() }, []) // eslint-disable-line

  const pick = (f: File) => { setFile(f); setPreview(URL.createObjectURL(f)); setResult(null) }

  const analyze = async () => {
    if (!file) return
    setBusy(true); setResult(null)
    try {
      const res = await analyzePlant(file, crop, language)
      setResult(res)
      publish('Plant Health', res.error
        ? `Analysis failed: ${res.error}`
        : `Just diagnosed ${crop || 'a crop'}: ${res.disease} (confidence ${Math.round((res.confidence || 0) * 100)}%, `
          + `severity ${res.severity}). Recommendation: ${res.recommendation}`
          + (res.uncertain ? ' — flagged as uncertain, low confidence.' : ''))
      loadHistory()
    } catch {
      setResult({ error: 'Analysis failed. Ensure the backend is running and CROP_HEALTH_API_KEY is configured (or an alternate VISION_PROVIDER).' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-field-800 mb-1">🍃 Plant Health</h1>
      <p className="text-sm text-gray-500 mb-4">
        Post a photo of your crop. Uses Kindwise crop.health to identify diseases,
        pests and other crop-health issues from the leaf.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); e.dataTransfer.files[0] && pick(e.dataTransfer.files[0]) }}
            className="border-2 border-dashed border-field-300 rounded-2xl p-6 text-center cursor-pointer hover:bg-field-50 transition"
          >
            {preview ? (
              <img src={preview} alt="leaf" className="max-h-56 mx-auto rounded-xl" />
            ) : (
              <div className="py-8 text-gray-400">
                <div className="text-4xl mb-2">📷</div>
                <p className="text-sm">{t('plant.upload')}</p>
              </div>
            )}
            <input ref={inputRef} type="file" accept="image/*" hidden
              onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
          </div>

          <input value={crop} onChange={(e) => setCrop(e.target.value)}
            placeholder={t('plant.cropph')}
            className="mt-3 w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-field-600" />

          <Button onClick={analyze} disabled={!file || busy}>
            {busy ? 'Analyzing…' : 'Analyze crop health'}
          </Button>
        </Card>

        <Card>
          <h3 className="font-semibold text-field-800 mb-2">{t('common.result')}</h3>
          {busy && <Spinner />}
          {!busy && !result && <p className="text-sm text-gray-400 py-8 text-center">{t('crop.noanalysis')}</p>}
          {result?.error && <p className="text-sm text-red-600">{result.error}</p>}
          {result && !result.error && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xl font-bold text-field-800">
                  {result.uncertain ? '⚠️ Uncertain' : result.issue_type === 'pest' ? `🐛 Pest: ${result.disease.replace(/^Pest:\s*/i, '')}` : `🍃 ${result.disease}`}
                </span>
                {!result.uncertain && result.disease !== 'Healthy' && (
                  <StatusPill status={result.confidence >= 0.8 ? 'OPTIMAL' : 'WARNING'} />
                )}
              </div>
              {result.confidence > 0 && (
                <p className="text-sm text-gray-500">
                  Confidence: {(result.confidence * 100).toFixed(0)}%
                  {result.severity && result.severity !== 'unknown' && ` · Severity: ${result.severity}`}
                </p>
              )}
              {result.uncertain && result.model_guess && (
                <p className="text-xs text-gray-400">Model guess: {result.model_guess} (low confidence)</p>
              )}

              <PointSection label={t('common.symptoms')} text={result.symptoms} />
              <RecommendationHighlights
                recommendation={result.recommendation}
                pesticides={(result.medicine?.chemical || []).filter(Boolean)}
                fertilizers={(result.medicine?.fertilizer || []).filter(Boolean)}
                title={t('common.recommendation')}
              />
              {result.prevention && <PointSection label={t('plant.prevention')} text={result.prevention} />}

              {!result.uncertain && (
                <p className="text-[11px] text-gray-400 border-t pt-2">
                  This is an AI-assisted suggestion. For critical decisions, confirm with an agricultural expert.
                </p>
              )}
            </div>
          )}
        </Card>
      </div>

      {history.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold text-field-800 mb-2">{t('plant.recent')}</h3>
          <div className="space-y-2">
            {history.map((h) => (
              <Card key={h.id} className="!p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{h.disease}</span>
                  <span className="text-gray-400">{new Date(h.date).toLocaleString()}</span>
                </div>
                {h.crop && <span className="text-xs text-gray-500">{h.crop}</span>}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
