import { useRef, useState } from 'react'
import { fileDisasterReport } from '../services/api'
import { VoiceField } from './VoiceInput'
import { useLanguage } from '../contexts/LanguageContext'

/**
 * Dashboard corner widget for filing a real emergency report — flood, pest
 * attack, no water, fire, or anything else threatening the crop — by photo,
 * video, a recorded voice note, and/or a typed/dictated text description.
 *
 * Agentic by the same rules as app/agents/agent.py on the backend: this
 * widget itself makes no severity judgement, no plausibility judgement, and
 * no relief-channel decision client-side — it just gathers evidence (media,
 * voice note, GPS + the GPS fix's own timestamp, disaster type,
 * description) and hands it to POST /api/disaster/report, where a fixed
 * tool chain decides all of that:
 *   - severity + routing: app/services/disaster_triage.py
 *   - location/time plausibility + relief-channel matching:
 *     app/services/relief_channels.py
 * See those two files for the actual logic. Nothing here is invented by an
 * LLM or by this component.
 */

const DISASTER_TYPES = [
  { key: 'flood', icon: '🌊', labelKey: 'disaster.type.flood' },
  { key: 'drought', icon: '🏜️', labelKey: 'disaster.type.drought' },
  { key: 'pest', icon: '🐛', labelKey: 'disaster.type.pest' },
  { key: 'disease', icon: '🍃', labelKey: 'disaster.type.disease' },
  { key: 'fire', icon: '🔥', labelKey: 'disaster.type.fire' },
  { key: 'other', icon: '⚠️', labelKey: 'disaster.type.other' },
] as const

type LocState = 'idle' | 'locating' | 'ok' | 'failed'
type RecState = 'idle' | 'recording' | 'recorded' | 'unsupported'

export function DisasterReportWidget() {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)

  const [disasterType, setDisasterType] = useState<string>('')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const [locState, setLocState] = useState<LocState>('idle')
  const [coords, setCoords] = useState<{ lat: number; lon: number; timestamp: number } | null>(null)

  // --- Voice note (recorded in-browser, separate from text dictation) ---
  const [recState, setRecState] = useState<RecState>('idle')
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null)
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)

  const locate = () => {
    if (!navigator.geolocation) { setLocState('failed'); return }
    setLocState('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude, timestamp: pos.timestamp })
        setLocState('ok')
      },
      () => setLocState('failed'),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  const openModal = () => {
    setOpen(true)
    setDisasterType(''); setDescription(''); setFiles([]); setPreviews([])
    setError(''); setResult(null)
    clearVoiceNote()
    locate()
  }

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const MAX_FILES = 5
    const MAX_FILE_BYTES = 25 * 1024 * 1024
    const picked = Array.from(list).slice(0, MAX_FILES - files.length)
    const invalid = picked.find((f) =>
      !['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'].includes(f.type) ||
      f.size > MAX_FILE_BYTES
    )
    if (invalid) {
      setError(t('disaster.error'))
      return
    }
    setFiles((f) => [...f, ...picked])
    setPreviews((p) => [...p, ...picked.map((f) => URL.createObjectURL(f))])
  }

  const removeFile = (i: number) => {
    setFiles((f) => f.filter((_, idx) => idx !== i))
    setPreviews((p) => p.filter((_, idx) => idx !== i))
  }

  // --- Voice note recording ---
  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setRecState('unsupported')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const recorder = new MediaRecorder(stream)
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setVoiceBlob(blob)
        setVoiceUrl(URL.createObjectURL(blob))
        setRecState('recorded')
        streamRef.current?.getTracks().forEach((tr) => tr.stop())
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecState('recording')
    } catch {
      setRecState('unsupported')
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
  }

  const clearVoiceNote = () => {
    if (voiceUrl) URL.revokeObjectURL(voiceUrl)
    setVoiceBlob(null); setVoiceUrl(null); setRecState('idle')
  }

  const submit = async () => {
    if (!disasterType) { setError(t('disaster.needinput')); return }
    if (!description.trim() && files.length === 0 && !voiceBlob) { setError(t('disaster.needinput')); return }
    setBusy(true); setError('')
    try {
      const res = await fileDisasterReport({
        disasterType, description,
        latitude: coords?.lat, longitude: coords?.lon, locationTimestamp: coords?.timestamp,
        files, voiceNote: voiceBlob || undefined,
      })
      setResult(res)
    } catch {
      setError(t('disaster.error'))
    } finally {
      setBusy(false)
    }
  }

  const close = () => {
    setOpen(false)
    previews.forEach((u) => URL.revokeObjectURL(u))
    clearVoiceNote()
  }

  return (
    <>
      {/* Fixed circular alert button — bottom-left corner of the viewport */}
      <button
        onClick={openModal}
        className="fixed bottom-6 left-6 z-40 w-14 h-14 rounded-full
                   bg-gradient-to-br from-red-600 to-red-800 shadow-lg
                   ring-2 ring-red-300/50 hover:ring-red-400
                   flex items-center justify-center transition group
                   hover:scale-110 active:scale-95"
        title={t('disaster.corner.title')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
          className="w-6 h-6 text-white">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-400 border-2 border-white animate-pulse" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={close}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5"
               onClick={(e) => e.stopPropagation()}>

            {!result ? (
              <>
                <div className="flex items-start justify-between mb-1">
                  <h2 className="text-lg font-bold text-field-800">🚨 {t('disaster.modal.title')}</h2>
                  <button onClick={close} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
                </div>
                <p className="text-xs text-gray-500 mb-4">{t('disaster.modal.sub')}</p>

                {/* Disaster type */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {DISASTER_TYPES.map((d) => (
                    <button key={d.key} onClick={() => setDisasterType(d.key)}
                      className={`rounded-xl border px-2 py-2.5 text-center transition
                        ${disasterType === d.key ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <div className="text-xl">{d.icon}</div>
                      <div className="text-[10px] font-semibold text-gray-700 mt-0.5 leading-tight">{t(d.labelKey)}</div>
                    </button>
                  ))}
                </div>

                {/* Description with voice dictation */}
                <VoiceField
                  value={description} onChange={setDescription} multiline rows={3}
                  label={t('disaster.description.label')}
                  placeholder={t('disaster.description.placeholder')}
                  className="mb-4"
                />

                {/* Voice note (recorded audio, separate from dictated text) */}
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    🎙️ {t('disaster.voicenote.label')}
                  </label>
                  {recState === 'unsupported' && (
                    <p className="text-[11px] text-amber-600">{t('disaster.voicenote.unsupported')}</p>
                  )}
                  {(recState === 'idle') && (
                    <button onClick={startRecording}
                      className="text-sm border-2 border-dashed border-field-300 rounded-xl px-4 py-2.5 w-full
                                 text-field-700 font-semibold hover:bg-field-50 transition">
                      🎙️ {t('disaster.voicenote.start')}
                    </button>
                  )}
                  {recState === 'recording' && (
                    <button onClick={stopRecording}
                      className="text-sm rounded-xl px-4 py-2.5 w-full bg-red-50 border-2 border-red-300
                                 text-red-700 font-semibold flex items-center justify-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                      {t('disaster.voicenote.recording')}
                    </button>
                  )}
                  {recState === 'recorded' && voiceUrl && (
                    <div className="flex items-center gap-2">
                      <audio src={voiceUrl} controls className="flex-1 h-9" />
                      <button onClick={clearVoiceNote}
                        className="text-xs text-red-600 font-semibold px-2 py-1 hover:bg-red-50 rounded-lg">
                        {t('common.remove') || '✕'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Media evidence */}
                <div className="mb-4">
                  <button onClick={() => inputRef.current?.click()}
                    className="text-sm border-2 border-dashed border-field-300 rounded-xl px-4 py-3 w-full
                               text-field-700 font-semibold hover:bg-field-50 transition">
                    📷 {t('disaster.attach')}
                  </button>
                  <input ref={inputRef} type="file" accept="image/*,video/*" multiple hidden
                    onChange={(e) => addFiles(e.target.files)} />
                  {previews.length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {previews.map((src, i) => (
                        <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-100">
                          {files[i]?.type.startsWith('video') ? (
                            <video src={src} className="w-full h-full object-cover" />
                          ) : (
                            <img src={src} className="w-full h-full object-cover" />
                          )}
                          <button onClick={() => removeFile(i)}
                            className="absolute top-0 right-0 bg-black/60 text-white text-[10px] w-4 h-4 rounded-bl">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Location */}
                <div className="flex items-center gap-2 text-xs mb-4 rounded-xl bg-gray-50 px-3 py-2">
                  {locState === 'locating' && <span className="text-gray-500">📍 {t('disaster.location.locating')}</span>}
                  {locState === 'ok' && <span className="text-green-700 font-medium">📍 {t('disaster.location.captured')}</span>}
                  {locState === 'failed' && (
                    <>
                      <span className="text-amber-600 flex-1">📍 {t('disaster.location.failed')}</span>
                      <button onClick={locate} className="text-field-700 font-semibold underline">{t('disaster.location.retry')}</button>
                    </>
                  )}
                </div>

                {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

                <button onClick={submit} disabled={busy}
                  className="w-full bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white font-semibold
                             py-3 rounded-xl transition">
                  {busy ? t('disaster.filing') : `🚨 ${t('disaster.submit')}`}
                </button>
              </>
            ) : (
              <>
                <div className="text-center mb-4">
                  <div className="text-4xl mb-2">✅</div>
                  <h2 className="text-lg font-bold text-field-800">{t('disaster.success.title')}</h2>
                </div>
                <div className="space-y-2 text-sm bg-gray-50 rounded-xl p-4 mb-4">
                  <Row label={t('disaster.success.ref')} value={result.reference_no} mono />
                  <Row label={t('disaster.success.severity')} value={result.severity} />
                  <Row label={t('disaster.success.filedto')} value={result.filed_to} />
                </div>
                {result.severity_reason && (
                  <p className="text-xs text-gray-500 mb-4">{result.severity_reason}</p>
                )}

                {/* Verification: location + time plausibility, plainly stated */}
                {result.verification && (
                  <div className="rounded-xl border border-gray-200 p-3 mb-4 text-xs space-y-1.5">
                    <p className="font-semibold text-gray-600 mb-1">{t('disaster.verification.title')}</p>
                    <VerificationRow
                      ok={result.verification.location?.plausible}
                      note={result.verification.location?.note} />
                    <VerificationRow
                      ok={result.verification.time?.plausible}
                      note={result.verification.time?.note} />
                  </div>
                )}

                {/* Matched relief channel */}
                {result.relief_channel ? (
                  <div className="rounded-xl border-2 border-field-200 bg-field-50 p-4 mb-4">
                    <p className="text-[11px] font-semibold text-field-600 uppercase tracking-wide mb-1">
                      {t('disaster.channel.matched')}
                    </p>
                    <h3 className="font-bold text-field-800 mb-1">{result.relief_channel.name}</h3>
                    <p className="text-xs text-gray-600 mb-2">{result.relief_channel.description}</p>

                    <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full mb-2
                      ${result.relief_channel.provides_money
                        ? 'bg-green-100 text-green-800 border border-green-300'
                        : 'bg-amber-100 text-amber-800 border border-amber-300'}`}>
                      {result.relief_channel.provides_money ? `💰 ${t('disaster.channel.moneyyes')}` : `ℹ️ ${t('disaster.channel.moneyno')}`}
                    </div>

                    {result.relief_channel.provides_money && result.relief_channel.amount_info && (
                      <p className="text-xs text-gray-600 mb-2">{result.relief_channel.amount_info}</p>
                    )}

                    <div className="text-xs text-gray-500 space-y-0.5">
                      <p>
                        📅 {t('disaster.channel.activeuntil')}{': '}
                        <span className="font-semibold text-gray-700">
                          {result.relief_channel.open_ended
                            ? t('disaster.channel.ongoing')
                            : new Date(result.relief_channel.active_until).toLocaleDateString()}
                        </span>
                      </p>
                      {result.relief_channel.contact && (
                        <p>☎️ {result.relief_channel.contact}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 mb-4 text-xs text-gray-500">
                    {t('disaster.channel.none')}
                  </div>
                )}

                <button onClick={close}
                  className="w-full bg-field-700 hover:bg-field-800 text-white font-semibold py-3 rounded-xl transition">
                  {t('disaster.close')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={`font-semibold text-field-800 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

function VerificationRow({ ok, note }: { ok: boolean | null | undefined; note?: string }) {
  if (!note) return null
  const icon = ok === true ? '✅' : ok === false ? '⚠️' : 'ℹ️'
  const color = ok === true ? 'text-green-700' : ok === false ? 'text-amber-700' : 'text-gray-500'
  return <p className={color}>{icon} {note}</p>
}
