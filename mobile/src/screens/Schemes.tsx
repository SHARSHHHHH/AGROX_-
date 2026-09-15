import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Linking, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { checkEligibility, getUser, getOnboardingStatus, markSchemeInterest, getMySchemeInterests } from '../services/api'
import { Card, Spinner, COLORS } from '../components/UI'
import { useLanguage } from '../contexts/LanguageContext'

export default function SchemesScreen() {
  const { t } = useLanguage()
  const [form, setForm] = useState({ state: '', farmer_category: 'small', land_size_acres: '1', crop: '' })
  const [eligible, setEligible] = useState<any[] | null>(null)
  const [checking, setChecking] = useState(true)
  const [autofilled, setAutofilled] = useState(false)
  const [chosen, setChosen] = useState<number[]>([])

  const set = (k: string, v: string) => setForm({ ...form, [k]: v })

  const chooseScheme = async (id: number) => {
    setChosen((c) => [...c, id])
    try { await markSchemeInterest(id) } catch { setChosen((c) => c.filter((x) => x !== id)) }
  }

  const runCheck = async () => {
    setChecking(true)
    try {
      const res = await checkEligibility({ ...form, land_size_acres: +form.land_size_acres || 0 })
      setEligible((res || []).filter((r: any) => r.verdict === 'Likely eligible'))
    } finally { setChecking(false) }
  }

  useEffect(() => {
    getUser().then((u) => { if (u?.state) setForm((f) => ({ ...f, state: u.state })) })
    getOnboardingStatus().then((s) => {
      const farm = s?.farm
      if (farm) {
        setForm((f) => ({ state: f.state || farm.state || '', farmer_category: farm.farmer_category || f.farmer_category, land_size_acres: farm.land_size_acres ? String(farm.land_size_acres) : f.land_size_acres, crop: farm.crop || f.crop }))
        setAutofilled(true)
      }
    }).catch(() => {}).finally(() => runCheck())
    getMySchemeInterests().then(setChosen).catch(() => {})
  }, [])

  return (
    <SafeAreaView style={ss.safe}>
      <ScrollView contentContainerStyle={ss.content} refreshControl={<RefreshControl refreshing={checking && !eligible} onRefresh={runCheck} tintColor={COLORS.primary} />}>
        <Text style={ss.title}>🏛️ {t('schemes.title') || 'Government Schemes'}</Text>
        <Text style={ss.sub}>{t('schemes.subtitle') || 'Schemes you likely qualify for'}</Text>

        <Card style={ss.mt}>
          {autofilled && <Text style={ss.autofillNote}>✓ Pre-filled from your farm profile</Text>}
          <View style={ss.formGrid}>
            <TextInput style={ss.input} value={form.state} onChangeText={(v) => set('state', v)} placeholder="State" placeholderTextColor="#9ca3af" />
            <TextInput style={ss.input} value={form.land_size_acres} onChangeText={(v) => set('land_size_acres', v)} placeholder="Land (acres)" keyboardType="numeric" placeholderTextColor="#9ca3af" />
            <TextInput style={ss.input} value={form.crop} onChangeText={(v) => set('crop', v)} placeholder="Crop (optional)" placeholderTextColor="#9ca3af" />
          </View>
          <View style={ss.catRow}>
            {['marginal', 'small', 'medium', 'large'].map((c) => (
              <TouchableOpacity key={c} onPress={() => set('farmer_category', c)}
                style={[ss.catBtn, form.farmer_category === c && ss.catBtnActive]}>
                <Text style={[ss.catBtnText, form.farmer_category === c && ss.catBtnTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={ss.checkBtn} onPress={runCheck} disabled={checking}>
            <Text style={ss.checkBtnText}>{checking ? 'Checking…' : 'Check Eligibility'}</Text>
          </TouchableOpacity>
        </Card>

        {checking && !eligible && <Spinner />}

        {eligible?.length === 0 && (
          <Card style={ss.mt}><Text style={ss.empty}>No schemes matched your profile. Try adjusting the form above.</Text></Card>
        )}

        {eligible?.map((r) => (
          <Card key={r.scheme_id} style={ss.schemeCard}>
            <View style={ss.schemeHeader}>
              <Text style={ss.schemeName}>{r.scheme_name}</Text>
              <View style={[ss.badge, { backgroundColor: r.level === 'central' ? '#dbeafe' : '#fef9c3' }]}>
                <Text style={[ss.badgeText, { color: r.level === 'central' ? '#1e40af' : '#92400e' }]}>
                  {r.level === 'central' ? 'Central' : r.scheme_state || 'State'}
                </Text>
              </View>
            </View>
            {r.why?.slice(0, 3).map((w: string, i: number) => (
              <Text key={i} style={ss.whyItem}>• {w}</Text>
            ))}
            {r.note && <Text style={ss.note}>⚠️ {r.note}</Text>}
            <View style={ss.schemeFooter}>
              {chosen.includes(r.scheme_id)
                ? <Text style={ss.appliedText}>✓ Marked as applying</Text>
                : <TouchableOpacity onPress={() => chooseScheme(r.scheme_id)}><Text style={ss.applyLink}>Mark as Applying</Text></TouchableOpacity>}
              <TouchableOpacity onPress={() => r.url && Linking.openURL(r.url)} style={ss.applyBtn}>
                <Text style={ss.applyBtnText}>Apply ↗</Text>
              </TouchableOpacity>
            </View>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}

const ss = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.primaryDark },
  sub: { fontSize: 13, color: COLORS.textMuted },
  mt: { marginTop: 4 },
  autofillNote: { fontSize: 12, color: COLORS.primary, fontWeight: '600', marginBottom: 10 },
  formGrid: { gap: 8, marginBottom: 8 },
  input: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.textPrimary, backgroundColor: '#f9fafb' },
  catRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  catBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', backgroundColor: '#f9fafb' },
  catBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catBtnText: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },
  catBtnTextActive: { color: '#fff' },
  checkBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  checkBtnText: { color: '#fff', fontWeight: '800' },
  empty: { textAlign: 'center', color: COLORS.textMuted, padding: 20 },
  schemeCard: { marginBottom: 4 },
  schemeHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, gap: 8 },
  schemeName: { fontSize: 15, fontWeight: '700', color: COLORS.primaryDark, flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  whyItem: { fontSize: 13, color: '#4b5563', lineHeight: 20 },
  note: { fontSize: 12, color: '#d97706', marginTop: 6 },
  schemeFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  appliedText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  applyLink: { fontSize: 13, fontWeight: '700', color: COLORS.primary, textDecorationLine: 'underline' },
  applyBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  applyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
})
