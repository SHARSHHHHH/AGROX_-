import { useEffect, useRef, useState } from 'react'
import { getWeather } from '../services/api'
import { useLanguage } from '../contexts/LanguageContext'

const CONDITION_ICON: Record<string, string> = {
  clear: '☀️', sunny: '☀️', cloudy: '☁️', 'partly cloudy': '⛅',
  rain: '🌧️', rainy: '🌧️', thunderstorm: '⛈️', storm: '⛈️',
  fog: '🌫️', mist: '🌫️', haze: '🌫️',
}

/**
 * Weather used to have its own sidebar tab; it's now a compact circular
 * icon pinned to the top-right of every farmer/balcony page instead. Tapping
 * it opens the weather card right there as a dropdown — it does NOT
 * navigate to a separate page, since a weather check is a "glance and
 * dismiss" action, not something that should interrupt whatever the farmer
 * was already looking at underneath.
 */
export function WeatherWidget() {
  const { t } = useLanguage()
  const [wx, setWx] = useState<any>(null)
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getWeather().then(setWx).catch(() => {})
  }, [])

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!wx) return null

  const icon = CONDITION_ICON[(wx.condition || '').toLowerCase()] || '🌤️'

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        title={t('nav.weather')}
        aria-label={t('nav.weather')}
        className={`w-11 h-11 rounded-full flex items-center justify-center text-2xl
          bg-gradient-to-br from-field-600 to-field-800 shadow-sm border-2
          transition hover:scale-105
          ${open ? 'border-field-300 ring-2 ring-field-200' : 'border-white'}`}
      >
        {icon}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 z-30
                        bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3
                          bg-gradient-to-r from-field-700 to-field-800 text-white">
            <span className="font-display font-bold text-sm">🌤️ {t('nav.weather')}</span>
            <button onClick={() => setOpen(false)} aria-label={t('common.close')}
              className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center">
              ✕
            </button>
          </div>

          <div className="p-4">
            <div className="rounded-xl p-4 bg-gradient-to-br from-field-600 to-field-800 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-4xl font-bold font-display">{Math.round(wx.temperature)}°C</p>
                  <p className="text-field-100 mt-1 text-sm">{wx.condition}</p>
                </div>
                <div className="text-right text-xs space-y-0.5">
                  <p>💧 Humidity {wx.humidity}%</p>
                  <p>🌧️ Rain {wx.rain_probability}%</p>
                  <p>💨 Wind {wx.wind_speed} km/h</p>
                </div>
              </div>
              {wx.interpretation && (
                <div className="mt-3 bg-white/15 rounded-lg p-2.5 text-xs">
                  🌱 {wx.interpretation}
                </div>
              )}
            </div>

            <a href="/weather"
              className="block text-center mt-3 text-xs font-semibold text-field-600 hover:text-field-800">
              Full forecast & 7-day outlook →
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
