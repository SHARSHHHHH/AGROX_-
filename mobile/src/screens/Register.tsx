import React, { useState, useRef, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native'
import { Picker } from '@react-native-picker/picker'
import indiaData from '../utils/india.json'
import { LinearGradient } from 'expo-linear-gradient'
import { register, requestOtp, verifyOtp, registerFarmer } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { COLORS } from '../components/UI'

type FarmerStep = 'phone' | 'otp' | 'details'

const LANGS = [['en', 'English'], ['hi', 'हिंदी'], ['ta', 'தமிழ்']]

export default function RegisterScreen({ navigation }: any) {
  const { t } = useLanguage()
  const { setUser } = useAuth()

  const [mode, setMode] = useState<'farm' | 'balcony' | 'buyer'>('farm')
  const [language, setLang] = useState('en')
  const [state, setState] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  // Email flow
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')

  const submitEmailFlow = async () => {
    setLoading(true); setErr('')
    try {
      const user = await register({ name, email, password, mode, language, state })
      setUser(user)
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  // Farmer OTP flow
  const [farmerStep, setFarmerStep] = useState<FarmerStep>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [phoneVerifiedToken, setPhoneVerifiedToken] = useState('')
  const [farmerName, setFarmerName] = useState('')
  const [farmerPassword, setFarmerPassword] = useState('')
  const [farmerConfirmPassword, setFarmerConfirmPassword] = useState('')
  const states = indiaData.map(s => s.name)
  const [cooldown, setCooldown] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  const startCooldown = (s: number) => {
    setCooldown(s)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1 && timerRef.current) { clearInterval(timerRef.current); return 0 }
        return c - 1
      })
    }, 1000)
  }

  const sendOtp = async () => {
    setLoading(true); setErr('')
    try {
      const res = await requestOtp(phone, 'register')
      setFarmerStep('otp')
      startCooldown(res.resend_after_seconds || 30)
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Failed to send OTP.')
    } finally { setLoading(false) }
  }

  const verifyOtpStep = async () => {
    setLoading(true); setErr('')
    try {
      const token = await verifyOtp(phone, otp, 'register')
      setPhoneVerifiedToken(token)
      setFarmerStep('details')
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Invalid OTP.')
    } finally { setLoading(false) }
  }

  const submitFarmerFlow = async () => {
    if (farmerPassword !== farmerConfirmPassword) { setErr('Passwords do not match.'); return }
    setLoading(true); setErr('')
    try {
      const user = await registerFarmer({
        name: farmerName, phone, password: farmerPassword,
        confirm_password: farmerConfirmPassword,
        phone_verified_token: phoneVerifiedToken,
        language, state,
      })
      setUser(user)
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Registration failed.')
    } finally { setLoading(false) }
  }

  const isFarmer = mode === 'farm'

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#1b4332', '#2d6a4f', '#40916c']} style={ss.gradient}>
        <ScrollView contentContainerStyle={ss.scroll} keyboardShouldPersistTaps="handled">
          <View style={ss.header}>
            <TouchableOpacity onPress={() => navigation.navigate('Login')} style={ss.backBtn}>
              <Text style={ss.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={ss.headerTitle}>🌾 Create Account</Text>
          </View>

          <View style={ss.card}>
            {/* Mode selector */}
            <Text style={ss.sectionLabel}>Account Type</Text>
            <View style={ss.modeRow}>
              {(['farm', 'balcony', 'buyer'] as const).map((m) => (
                <TouchableOpacity key={m} onPress={() => setMode(m)}
                  style={[ss.modeBtn, mode === m && ss.modeBtnActive]}>
                  <Text style={ss.modeBtnEmoji}>
                    {m === 'farm' ? '🌾' : m === 'balcony' ? '🪴' : '🛒'}
                  </Text>
                  <Text style={[ss.modeBtnText, mode === m && ss.modeBtnTextActive]}>
                    {m === 'farm' ? 'Farmer' : m === 'balcony' ? 'Balcony' : 'Buyer'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Language */}
            <Text style={ss.sectionLabel}>Language</Text>
            <View style={ss.langRow}>
              {LANGS.map(([code, label]) => (
                <TouchableOpacity key={code} onPress={() => setLang(code)}
                  style={[ss.langBtn, language === code && ss.langBtnActive]}>
                  <Text style={[ss.langBtnText, language === code && ss.langBtnTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Farmer OTP flow */}
            {isFarmer ? (
              <>
                {farmerStep === 'phone' && (
                  <>
                    <Text style={ss.label}>Phone Number</Text>
                    <TextInput style={ss.input} value={phone} onChangeText={setPhone}
                      keyboardType="phone-pad" placeholder="+91 98XXXXXXXX" placeholderTextColor="#9ca3af" />
                    {err ? <Text style={ss.err}>{err}</Text> : null}
                    <TouchableOpacity style={ss.submitBtn} onPress={sendOtp} disabled={loading || !phone}>
                      <Text style={ss.submitBtnText}>{loading ? 'Sending…' : 'Send OTP'}</Text>
                    </TouchableOpacity>
                  </>
                )}
                {farmerStep === 'otp' && (
                  <>
                    <Text style={ss.label}>Enter OTP (check backend terminal)</Text>
                    <TextInput style={ss.input} value={otp} onChangeText={setOtp}
                      keyboardType="number-pad" placeholder="6-digit code" placeholderTextColor="#9ca3af" maxLength={6} />
                    {err ? <Text style={ss.err}>{err}</Text> : null}
                    <TouchableOpacity style={ss.submitBtn} onPress={verifyOtpStep} disabled={loading || otp.length < 4}>
                      <Text style={ss.submitBtnText}>{loading ? 'Verifying…' : 'Verify OTP'}</Text>
                    </TouchableOpacity>
                    {cooldown > 0 && <Text style={ss.cooldown}>Resend in {cooldown}s</Text>}
                  </>
                )}
                {farmerStep === 'details' && (
                  <>
                    <Text style={ss.label}>Full Name</Text>
                    <TextInput style={ss.input} value={farmerName} onChangeText={setFarmerName} placeholder="Your name" placeholderTextColor="#9ca3af" />
                    <Text style={ss.label}>State</Text>
                    <View style={ss.pickerWrap}>
                      <Picker selectedValue={state} onValueChange={setState}>
                        <Picker.Item label="Select State" value="" color="#9ca3af" />
                        {states.map(s => <Picker.Item key={s} label={s} value={s} />)}
                      </Picker>
                    </View>
                    <Text style={ss.label}>Password</Text>
                    <TextInput style={ss.input} value={farmerPassword} onChangeText={setFarmerPassword} secureTextEntry placeholder="••••••" placeholderTextColor="#9ca3af" />
                    <Text style={ss.label}>Confirm Password</Text>
                    <TextInput style={ss.input} value={farmerConfirmPassword} onChangeText={setFarmerConfirmPassword} secureTextEntry placeholder="••••••" placeholderTextColor="#9ca3af" />
                    {err ? <Text style={ss.err}>{err}</Text> : null}
                    <TouchableOpacity style={ss.submitBtn} onPress={submitFarmerFlow} disabled={loading}>
                      <Text style={ss.submitBtnText}>{loading ? 'Creating…' : 'Create Account'}</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            ) : (
              // Email flow (buyer/balcony)
              <>
                <Text style={ss.label}>Full Name</Text>
                <TextInput style={ss.input} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor="#9ca3af" />
                <Text style={ss.label}>Email</Text>
                <TextInput style={ss.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor="#9ca3af" />
                <Text style={ss.label}>State</Text>
                <View style={ss.pickerWrap}>
                  <Picker selectedValue={state} onValueChange={setState}>
                    <Picker.Item label="Select State" value="" color="#9ca3af" />
                    {states.map(s => <Picker.Item key={s} label={s} value={s} />)}
                  </Picker>
                </View>
                <Text style={ss.label}>Password</Text>
                <TextInput style={ss.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••" placeholderTextColor="#9ca3af" />
                {err ? <Text style={ss.err}>{err}</Text> : null}
                <TouchableOpacity style={ss.submitBtn} onPress={submitEmailFlow} disabled={loading}>
                  <Text style={ss.submitBtnText}>{loading ? 'Creating…' : 'Create Account'}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  )
}

const ss = StyleSheet.create({
  gradient: { flex: 1 },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backBtn: { marginRight: 12 },
  backText: { color: 'rgba(255,255,255,0.8)', fontSize: 16 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  card: { backgroundColor: '#fff', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOpacity: 0.15, shadowOffset: { width: 0, height: 8 }, shadowRadius: 24, elevation: 12 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modeBtn: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: '#f9fafb' },
  modeBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  modeBtnEmoji: { fontSize: 22 },
  modeBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, marginTop: 4 },
  modeBtnTextActive: { color: '#fff' },
  langRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  langBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', backgroundColor: '#f9fafb' },
  langBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  langBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  langBtnTextActive: { color: '#fff' },
  label: { fontSize: 13, fontWeight: '700', color: '#6b7280', marginBottom: 4 },
  input: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.textPrimary, backgroundColor: '#f9fafb', marginBottom: 12 },
  pickerWrap: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 10, backgroundColor: '#f9fafb', overflow: 'hidden', marginBottom: 12 },
  err: { color: COLORS.red, fontSize: 13, marginTop: 8 },
  submitBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8, shadowColor: COLORS.primary, shadowOpacity: 0.4, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, elevation: 4 },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  cooldown: { textAlign: 'center', color: COLORS.textMuted, fontSize: 13, marginTop: 8 },
})
