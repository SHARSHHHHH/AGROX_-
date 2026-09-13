import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { login } from '../services/api'
import { LanguagePicker, VoiceField } from '../components/VoiceInput'
import { MobileOnboarding, hasSeenOnboarding } from '../components/MobileOnboarding'
import { useLanguage } from '../contexts/LanguageContext'

// Phones get the 3-slide intro carousel first (once per device); anything
// wider skips straight to the sign-in card below — there's no "onboarding"
// concept on desktop, just the hero + form side by side.
const MOBILE_BREAKPOINT_PX = 640

/**
 * Login page background video.
 *
 * Source: a high-quality aerial drone shot over a green crop field opening
 * onto a mustard field — plain footage, no UI, no text, no mockup baked
 * into it. That matters: an earlier version reused a screen-recorded
 * DESIGN MOCKUP as the background, which already had its own headline/
 * pills/card burned into the pixels, and layering our own copy of that
 * same text on top produced visible double/ghosted text and a
 * card-behind-the-card outline. With plain footage that whole problem
 * class is gone — everything on screen is real, translated UI.
 *
 * Processing applied before landing here (see /public/media):
 *  - audio stripped (silent autoplay loop, no reason to ship an audio track)
 *  - turned into a forward+reverse "boomerang" loop: the source drone shot
 *    pushes forward for its whole 14.6s duration, so a hard cut back to
 *    frame 1 would visibly jump. Playing it forward then in reverse means
 *    the last frame IS the first frame, always — no jump, ever, regardless
 *    of how much the camera moved.
 *  - re-encoded for web (MP4 ~5.4MB / WebM ~7.2MB for the resulting 29s
 *    loop — the source was full 1080p with a lot of fine grass detail, so
 *    this is larger than a simpler clip would compress to) with
 *    `+faststart` so playback begins immediately instead of waiting on a
 *    full download — this is what actually prevents "lag"
 *  - a static poster JPG paints instantly on first load and is shown
 *    instead of video for anyone with prefers-reduced-motion set
 */
function LoginBackgroundVideo() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const onChange = () => setReducedMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    // Some mobile browsers ignore the autoPlay attribute for videos added
    // after first paint; calling play() directly is the reliable fallback.
    if (!reducedMotion) videoRef.current?.play().catch(() => {})
  }, [reducedMotion])

  return (
    <div className="absolute inset-0 overflow-hidden bg-field-900">
      {reducedMotion ? (
        <img src="/media/login-bg-poster.jpg" alt=""
             className="w-full h-full object-cover" />
      ) : (
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          poster="/media/login-bg-poster.jpg"
          autoPlay muted loop playsInline preload="auto"
          aria-hidden="true"
        >
          <source src="/media/login-bg.mp4" type="video/mp4" />
          <source src="/media/login-bg.webm" type="video/webm" />
        </video>
      )}
      {/* Dark scrim so white text/cards stay readable over bright sky or
          pale soil regardless of where in the loop the video currently is. */}
      <div className="absolute inset-0 bg-gradient-to-r from-field-900/75 via-field-900/45 to-field-900/60" />
    </div>
  )
}

export default function Login() {
  const [email, setEmail] = useState('farmer@demo.com')
  const [password, setPassword] = useState('demo123')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()
  const { t } = useLanguage()
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return window.innerWidth < MOBILE_BREAKPOINT_PX && !hasSeenOnboarding() } catch { return false }
  })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setErr('')
    try {
      const user = await login(email, password)
      nav(user.role === 'admin' ? '/admin' : user.role === 'buyer' ? '/marketplace' : '/dashboard')
    } catch {
      setErr(t('login.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center overflow-hidden">
      {showOnboarding && <MobileOnboarding onDone={() => setShowOnboarding(false)} />}
      <LoginBackgroundVideo />

      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-8 py-10
                      flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
        {/* Hero copy — real, translated React text (safe now that the video
            has nothing baked into it to collide with). Hidden on small
            screens so the card stays the focus where space is tight. */}
        <div className="hidden lg:block flex-1 text-white max-w-xl">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide
                           uppercase bg-white/10 border border-white/20 rounded-full px-3 py-1.5 mb-6">
            🌾 {t('app.name')}
          </span>
          <h1 className="font-display text-4xl xl:text-5xl font-bold leading-tight mb-4">
            {t('login.hero')}
          </h1>
          <p className="text-white/80 text-base leading-relaxed mb-6">
            {t('login.herosub')}
          </p>
          <div className="flex flex-wrap gap-2">
            {[['🌤️', 'nav.weather'], ['🌾', 'nav.crop']].map(([icon, key]) => (
              <span key={key} className="text-sm bg-black/20 border border-white/15 rounded-full px-3.5 py-1.5">
                {icon} {t(key)}
              </span>
            ))}
          </div>
        </div>

        {/* Real, functional sign-in card. Fully opaque — nothing behind it
            to hide, but kept solid rather than translucent on principle:
            a background video should never risk competing with form text. */}
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 sm:p-8 shrink-0">
          <div className="flex items-center gap-2 mb-1 lg:hidden">
            <span className="text-2xl">🌾</span>
            <h1 className="text-xl font-bold text-field-800 font-display">{t('app.name')}</h1>
          </div>

          {/* Sign in / Create account tabs — real navigation to the actual
              Register page, not a fake tab. */}
          <div className="flex bg-field-50 rounded-full p-1 mb-6">
            <span className="flex-1 text-center text-sm font-semibold py-2 rounded-full bg-field-600 text-white">
              {t('login.title')}
            </span>
            <Link to="/register"
                  className="flex-1 text-center text-sm font-medium py-2 rounded-full text-gray-500 hover:text-field-700">
              {t('login.register')}
            </Link>
          </div>

          <p className="text-sm text-gray-500 mb-5">{t('app.tagline')}</p>

          {/* Language is chosen BEFORE login and persists into the app, so a
              farmer never has to read English to reach their own language. */}
          <div className="mb-5">
            <LanguagePicker />
          </div>

          <form onSubmit={submit} className="space-y-4">
            {/* Voice-enabled so an email can be dictated rather than typed. */}
            <VoiceField
              label={t('login.emailorphone')}
              value={email}
              onChange={setEmail}
              type="text"
              placeholder="farmer@demo.com or 98XXXXXXXX"
            />

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                {t('login.password')}
              </label>
              {/* Passwords are deliberately NOT voice-enabled — dictating a
                  password aloud is a security problem, not a convenience. */}
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-field-600 outline-none"
              />
            </div>

            {err && <p className="text-sm text-red-600">{err}</p>}

            <button type="submit" disabled={loading}
              className="w-full bg-field-600 hover:bg-field-700 text-white font-semibold py-2.5 rounded-xl disabled:opacity-50">
              {loading ? t('login.signingin') : t('login.submit')}
            </button>
          </form>

          <div className="mt-4 text-center text-sm text-gray-500">
            {t('login.noaccount')} <Link to="/register" className="text-field-700 font-semibold">
              {t('login.register')}
            </Link>
          </div>

          <div className="mt-5 pt-4 border-t text-xs text-gray-400 space-y-1">
            <p className="font-semibold text-gray-500">{t('login.demologins')}</p>
            <p>👨‍🌾 farmer@demo.com / demo123</p>
            <p>🪴 balcony@demo.com / demo123</p>
            <p>🛒 buyer@demo.com / demo123</p>
            <p>🏛️ admin@agri.gov / admin123 (Govt dashboard)</p>
          </div>
        </div>
      </div>
    </div>
  )
}
