import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getUser, logout } from '../services/api'
import { Card, COLORS, Button } from '../components/UI'
import { useLanguage } from '../contexts/LanguageContext'
import { SPEECH_LANGS, SUPPORTED_UI_LANGS } from '../hooks/useSpeech'
import { useAuth } from '../contexts/AuthContext'

export default function SettingsScreen() {
  const { t, language, setLanguage } = useLanguage()
  const { setUser } = useAuth()
  const [user, setUserState] = useState<any>(null)

  useEffect(() => { getUser().then(setUserState) }, [])

  const doLogout = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        await logout()
        setUser(null)
      }},
    ])
  }

  return (
    <SafeAreaView style={ss.safe}>
      <ScrollView contentContainerStyle={ss.content}>
        <Text style={ss.title}>⚙️ {t('nav.settings') || 'Settings'}</Text>

        <Card style={ss.mt}>
          <Text style={ss.sectionTitle}>👤 Account</Text>
          <View style={ss.row}><Text style={ss.label}>Name</Text><Text style={ss.val}>{user?.name}</Text></View>
          <View style={ss.row}><Text style={ss.label}>Email</Text><Text style={ss.val}>{user?.email}</Text></View>
          <View style={ss.row}><Text style={ss.label}>Role</Text><Text style={ss.val}>{user?.role}</Text></View>
          <View style={ss.row}><Text style={ss.label}>Mode</Text><Text style={ss.val}>{user?.mode}</Text></View>
          <View style={ss.row}><Text style={ss.label}>State</Text><Text style={ss.val}>{user?.state}</Text></View>
        </Card>

        <Card style={ss.mt}>
          <Text style={ss.sectionTitle}>🌐 Language</Text>
          <View style={ss.langRow}>
            {(SUPPORTED_UI_LANGS as string[]).map((l) => (
              <TouchableOpacity key={l} onPress={() => setLanguage(l as any)}
                style={[ss.langBtn, language === l && ss.langBtnActive]}>
                <Text style={[ss.langBtnText, language === l && ss.langBtnTextActive]}>
                  {SPEECH_LANGS[l]?.native}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <Card style={ss.mt}>
          <Text style={ss.sectionTitle}>ℹ️ App</Text>
          <View style={ss.row}><Text style={ss.label}>Version</Text><Text style={ss.val}>1.0.0 (Expo)</Text></View>
          <View style={ss.row}><Text style={ss.label}>Backend</Text><Text style={ss.val}>http://10.0.2.2:8000</Text></View>
        </Card>

        <TouchableOpacity style={ss.logoutBtn} onPress={doLogout}>
          <Text style={ss.logoutText}>🚪 {t('common.signout') || 'Sign Out'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const ss = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.primaryDark },
  mt: { marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.primaryDark, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  label: { fontSize: 13, color: COLORS.textMuted },
  val: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
  langRow: { flexDirection: 'row', gap: 8 },
  langBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', backgroundColor: '#f9fafb' },
  langBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  langBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.textMuted },
  langBtnTextActive: { color: '#fff' },
  logoutBtn: { backgroundColor: '#ef4444', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  logoutText: { color: '#fff', fontWeight: '800', fontSize: 16 },
})
