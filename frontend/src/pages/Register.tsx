import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { register, requestOtp, verifyOtp, registerFarmer } from '../services/api'
import { useLanguage } from '../contexts/LanguageContext'

const LANGS = [['en','English'],['ta','Tamil'],['te','Telugu'],['kn','Kannada'],['ml','Malayalam'],['hi','Hindi']]

// A short, honest note: this app has no live SMS gateway wired in yet, so in
// this build the OTP is written to the BACKEND's own terminal log rather
// than actually sent as an SMS. Wiring in a real provider (Twilio/MSG91/etc)
// only requires changing app/services/otp_service.py on the server — nothing
// here on the frontend needs to change, since the OTP itself never reaches
// this code at all (by design: see the "Do not expose OTP secrets" rule).

type FarmerStep = 'phone' | 'otp' | 'details'

export default function Register() {
  const { t, tv } = useLanguage()
  const nav = useNavigate()

  // --- Shared account fields (used by both flows) ---
  const [mode, setMode] = useState<'farm' | 'balcony' | 'buyer'>('farm')
  const [language, setLanguage] = useState('en')
  const [state, setState] = useState('')
  const [district, setDistrict] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  // --- Home/Buyer: unchanged email + password flow ---
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const submitEmailFlow = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setErr('')
    try {
      await register({ name, email, password, mode, language, state, district })
      nav(mode === 'buyer' ? '/marketplace' : '/farm')
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  // --- Farmer: phone + OTP flow ---
  const [farmerStep, setFarmerStep] = useState<FarmerStep>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [phoneVerifiedToken, setPhoneVerifiedToken] = useState('')
  const [farmerName, setFarmerName] = useState('')
  const [farmerPassword, setFarmerPassword] = useState('')
  const [farmerConfirmPassword, setFarmerConfirmPassword] = useState('')
  const [showFarmerPassword, setShowFarmerPassword] = useState(false)
  const [showFarmerConfirm, setShowFarmerConfirm] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [otpExpiry, setOtpExpiry] = useState(0)   // countdown in seconds
  const [deliveryMethod, setDeliveryMethod] = useState<'sms_gate' | 'log'>('sms_gate')
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const expiryRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => {
    if (cooldownRef.current) clearInterval(cooldownRef.current)
    if (expiryRef.current) clearInterval(expiryRef.current)
  }, [])

  const startCooldown = (seconds: number) => {
    setCooldown(seconds)
    if (cooldownRef.current) clearInterval(cooldownRef.current)
    cooldownRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1 && cooldownRef.current) { clearInterval(cooldownRef.current); return 0 }
        return c - 1
      })
    }, 1000)
  }

  const startExpiryCountdown = (seconds: number) => {
    setOtpExpiry(seconds)
    if (expiryRef.current) clearInterval(expiryRef.current)
    expiryRef.current = setInterval(() => {
      setOtpExpiry((c) => {
        if (c <= 1 && expiryRef.current) { clearInterval(expiryRef.current); return 0 }
        return c - 1
      })
    }, 1000)
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  const sendOtp = async () => {
    setLoading(true); setErr('')
    try {
      const res = await requestOtp(phone, 'register')
      setFarmerStep('otp')
      setDeliveryMethod(res.delivery || 'sms_gate')
      startCooldown(res.resend_after_seconds || 30)
      startExpiryCountdown(res.expires_in_seconds || 600)
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Could not send OTP.')
    } finally {
      setLoading(false)
    }
  }

  const doVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setErr('')
    try {
      const token = await verifyOtp(phone, otp, 'register')
      setPhoneVerifiedToken(token)
      setFarmerStep('details')
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Invalid OTP.')
    } finally {
      setLoading(false)
    }
  }

  const submitFarmerFlow = async (e: React.FormEvent) => {
    e.preventDefault()
    if (farmerPassword !== farmerConfirmPassword) {
      setErr(t('register.passwordmismatch'))
      return
    }
    setLoading(true); setErr('')
    try {
      await registerFarmer({
        name: farmerName, phone, password: farmerPassword,
        confirm_password: farmerConfirmPassword,
        phone_verified_token: phoneVerifiedToken,
        language, state, district,
      })
      nav('/farm')
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = "w-full border rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-field-600"

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-field-800 to-field-600 p-4">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-8">
        <h1 className="text-2xl font-bold text-field-800 font-display text-center mb-1">{t('register.submit')}</h1>
        <p className="text-sm text-gray-500 text-center mb-5">{t('register.choosemode')}</p>

        <div className="grid grid-cols-3 gap-2 mb-5">
          {[['farm','🌾 Farmer'],['balcony','🪴 Home'],['buyer','🛒 Buyer']].map(([v, l]) => (
            <button key={v} type="button" onClick={() => { setMode(v as any); setErr('') }}
              className={`py-3 rounded-xl border-2 font-semibold text-xs sm:text-sm transition
                ${mode === v ? 'border-field-600 bg-field-50 text-field-700' : 'border-gray-200 text-gray-500'}`}>
              {l}
            </button>
          ))}
        </div>

        {mode === 'farm' ? (
          <>
            {farmerStep === 'phone' && (
              <form onSubmit={(e) => { e.preventDefault(); sendOtp() }} className="space-y-3">
                <input required placeholder={t('register.phone')} value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  inputMode="numeric" maxLength={10}
                  className={inputClass} />
                {err && <p className="text-sm text-red-600">{err}</p>}
                <button type="submit" disabled={loading || phone.length !== 10}
                  className="w-full bg-field-600 hover:bg-field-700 text-white font-semibold py-2.5 rounded-xl disabled:opacity-50">
                  {loading ? t('register.sendingotp') : t('register.sendotp')}
                </button>
              </form>
            )}

            {farmerStep === 'otp' && (
              <form onSubmit={doVerifyOtp} className="space-y-3">
                {/* SMS sent confirmation */}
                {deliveryMethod === 'sms_gate' ? (
                  <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                    <p className="text-sm font-semibold text-green-800">📱 SMS sent to +91 {phone}</p>
                    <p className="text-xs text-green-700 mt-0.5">
                      Enter the 6-digit code from the SMS.
                      {otpExpiry > 0 && <span className="font-semibold"> Expires in {formatTime(otpExpiry)}.</span>}
                      {otpExpiry === 0 && <span className="font-semibold text-red-600"> Code expired — request a new one.</span>}
                    </p>
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <p className="text-sm font-semibold text-amber-800">⚠️ SMS gateway offline</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      The OTP code has been printed in the <strong>backend terminal</strong>. Check the console running uvicorn.
                      {otpExpiry > 0 && <span className="font-semibold"> Expires in {formatTime(otpExpiry)}.</span>}
                      {otpExpiry === 0 && <span className="font-semibold text-red-600"> Code expired — request a new one.</span>}
                    </p>
                  </div>
                )}
                <input required placeholder={t('register.enterotp')} value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric" maxLength={6}
                  className={`${inputClass} text-center tracking-[0.5em] font-semibold`} />
                {err && <p className="text-sm text-red-600">{err}</p>}
                <button type="submit" disabled={loading || otp.length !== 6 || otpExpiry === 0}
                  className="w-full bg-field-600 hover:bg-field-700 text-white font-semibold py-2.5 rounded-xl disabled:opacity-50">
                  {loading ? t('register.verifying') : t('register.verifyotp')}
                </button>
                <div className="flex justify-between text-sm">
                  <button type="button" onClick={() => { setFarmerStep('phone'); setOtp(''); setErr('') }}
                    className="text-gray-500 hover:text-field-700">
                    {t('register.changenumber')}
                  </button>
                  <button type="button" disabled={cooldown > 0 || loading} onClick={sendOtp}
                    className="text-field-700 font-semibold disabled:opacity-40 disabled:text-gray-400">
                    {t('register.resendotp')}{cooldown > 0 ? ` (${cooldown}s)` : ''}
                  </button>
                </div>
              </form>
            )}

            {farmerStep === 'details' && (
              <form onSubmit={submitFarmerFlow} className="space-y-3">
                <p className="text-xs font-semibold text-field-700 bg-field-50 rounded-lg px-3 py-2">
                  {t('register.otpverified')} +91 {phone}
                </p>
                <input required placeholder={t('register.name')} value={farmerName}
                  onChange={(e) => setFarmerName(e.target.value)} className={inputClass} />

                <div className="relative">
                  <input required placeholder={t('login.password')}
                    type={showFarmerPassword ? 'text' : 'password'}
                    value={farmerPassword} onChange={(e) => setFarmerPassword(e.target.value)}
                    className={inputClass} />
                  <button type="button" onClick={() => setShowFarmerPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-semibold">
                    {showFarmerPassword ? t('common.hide') : t('common.show')}
                  </button>
                </div>

                <div className="relative">
                  <input required placeholder={t('register.confirmpassword')}
                    type={showFarmerConfirm ? 'text' : 'password'}
                    value={farmerConfirmPassword} onChange={(e) => setFarmerConfirmPassword(e.target.value)}
                    className={inputClass} />
                  <button type="button" onClick={() => setShowFarmerConfirm((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-semibold">
                    {showFarmerConfirm ? t('common.hide') : t('common.show')}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <input placeholder={t('common.state')} value={state}
                    onChange={(e) => setState(e.target.value)} className={inputClass} />
                  <input placeholder={t('common.district')} value={district}
                    onChange={(e) => setDistrict(e.target.value)} className={inputClass} />
                </div>
                <select value={language} onChange={(e) => setLanguage(e.target.value)} className={inputClass}>
                  {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>

                {err && <p className="text-sm text-red-600">{err}</p>}
                <button type="submit" disabled={loading}
                  className="w-full bg-field-600 hover:bg-field-700 text-white font-semibold py-2.5 rounded-xl disabled:opacity-50">
                  {loading ? 'Creating…' : t('register.submit')}
                </button>
              </form>
            )}
          </>
        ) : (
          <form onSubmit={submitEmailFlow} className="space-y-3">
            <input required placeholder={t('register.name')} value={name}
              onChange={(e) => setName(e.target.value)} className={inputClass} />
            <input required type="email" placeholder={t('login.email')} value={email}
              onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            <div className="relative">
              <input required placeholder={t('login.password')}
                type={showPassword ? 'text' : 'password'}
                value={password} onChange={(e) => setPassword(e.target.value)}
                className={inputClass} />
              <button type="button" onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-semibold">
                {showPassword ? t('common.hide') : t('common.show')}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder={t('common.state')} value={state}
                onChange={(e) => setState(e.target.value)} className={inputClass} />
              <input placeholder={t('common.district')} value={district}
                onChange={(e) => setDistrict(e.target.value)} className={inputClass} />
            </div>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className={inputClass}>
              {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-field-600 hover:bg-field-700 text-white font-semibold py-2.5 rounded-xl disabled:opacity-50">
              {loading ? 'Creating…' : t('register.submit')}
            </button>
          </form>
        )}

        <div className="mt-4 text-center text-sm text-gray-500">
          {t('register.haveaccount')} <Link to="/login" className="text-field-700 font-semibold">{t('login.submit')}</Link>
        </div>
      </div>
    </div>
  )
}
