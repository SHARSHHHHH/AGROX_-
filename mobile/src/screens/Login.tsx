import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, StatusBar, Alert,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { login } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { SPEECH_LANGS, SUPPORTED_UI_LANGS } from '../hooks/useSpeech'
import { COLORS } from '../components/UI'

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('farmer@demo.com')
  const [password, setPassword] = useState('demo123')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const { setUser } = useAuth()
  const { t, language, setLanguage } = useLanguage()

  const submit = async () => {
    setLoading(true); setErr('')
    try {
      const user = await login(email, password)
      setUser(user)
    } catch {
      setErr(t('login.error') || 'Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#1b4332', '#2d6a4f', '#40916c']} style={ss.gradient}>
        <ScrollView contentContainerStyle={ss.scroll} keyboardShouldPersistTaps="handled">
          {/* Logo */}
          <View style={ss.logoWrap}>
            <Text style={ss.logoEmoji}>🌾</Text>
            <Text style={ss.logoTitle}>AGROX</Text>
            <Text style={ss.logoSub}>{t('app.tagline') || 'Smart Farming, Better Harvest'}</Text>
          </View>

          {/* Card */}
          <View style={ss.card}>
            <Text style={ss.cardTitle}>{t('login.title') || 'Sign In'}</Text>

            {/* Language picker */}
            <View style={ss.langRow}>
              {(SUPPORTED_UI_LANGS as string[]).map((l) => (
                <TouchableOpacity
                  key={l}
                  onPress={() => setLanguage(l as any)}
                  style={[ss.langBtn, language === l && ss.langBtnActive]}
                >
                  <Text style={[ss.langBtnText, language === l && ss.langBtnTextActive]}>
                    {SPEECH_LANGS[l]?.native}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={ss.label}>{t('login.emailorphone') || 'Email or Phone'}</Text>
            <TextInput
              style={ss.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="farmer@demo.com"
              placeholderTextColor="#9ca3af"
            />

            <Text style={ss.label}>{t('login.password') || 'Password'}</Text>
            <TextInput
              style={ss.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••"
              placeholderTextColor="#9ca3af"
            />

            {err ? <Text style={ss.err}>{err}</Text> : null}

            <TouchableOpacity
              style={[ss.submitBtn, loading && ss.submitBtnDisabled]}
              onPress={submit}
              disabled={loading}
            >
              <Text style={ss.submitBtnText}>
                {loading ? (t('login.signingin') || 'Signing in…') : (t('login.submit') || 'Sign In')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate('Register')} style={ss.registerLink}>
              <Text style={ss.registerLinkText}>
                {t('login.noaccount') || "Don't have an account?"}{' '}
                <Text style={ss.registerLinkBold}>{t('login.register') || 'Register'}</Text>
              </Text>
            </TouchableOpacity>

            {/* Demo credentials */}
            <View style={ss.demoBox}>
              <Text style={ss.demoTitle}>{t('login.demologins') || 'Demo Credentials'}</Text>
              <Text style={ss.demoItem}>👨‍🌾 farmer@demo.com / demo123</Text>
              <Text style={ss.demoItem}>🪴 balcony@demo.com / demo123</Text>
              <Text style={ss.demoItem}>🛒 buyer@demo.com / demo123</Text>
              <Text style={ss.demoItem}>🏛️ admin@agri.gov / admin123</Text>
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  )
}

const ss = StyleSheet.create({
  gradient: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoWrap: { alignItems: 'center', marginBottom: 32 },
  logoEmoji: { fontSize: 56 },
  logoTitle: { fontSize: 36, fontWeight: '900', color: '#fff', letterSpacing: 2, marginTop: 8 },
  logoSub: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 4, textAlign: 'center' },
  card: {
    backgroundColor: '#fff', borderRadius: 24,
    padding: 24, shadowColor: '#000', shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 8 }, shadowRadius: 24, elevation: 12,
  },
  cardTitle: { fontSize: 22, fontWeight: '800', color: COLORS.primaryDark, marginBottom: 16 },
  langRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  langBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5,
    borderColor: COLORS.border, alignItems: 'center', backgroundColor: '#f9fafb',
  },
  langBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  langBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  langBtnTextActive: { color: '#fff' },
  label: { fontSize: 12, fontWeight: '700', color: '#4b5563', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    color: COLORS.textPrimary, backgroundColor: '#f9fafb',
  },
  err: { color: COLORS.red, fontSize: 13, marginTop: 8 },
  submitBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 20,
    shadowColor: COLORS.primary, shadowOpacity: 0.4, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, elevation: 4,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  registerLink: { marginTop: 16, alignItems: 'center' },
  registerLinkText: { color: COLORS.textMuted, fontSize: 14 },
  registerLinkBold: { color: COLORS.primary, fontWeight: '700' },
  demoBox: {
    marginTop: 20, padding: 14, backgroundColor: '#f0faf4',
    borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
  },
  demoTitle: { fontWeight: '700', color: COLORS.textSecondary, fontSize: 12, marginBottom: 6 },
  demoItem: { color: '#374151', fontSize: 12, marginBottom: 3 },
})
