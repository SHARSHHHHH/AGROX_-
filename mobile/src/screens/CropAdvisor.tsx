import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getCropList, recommendAdvisory, getSoil, getWeather, getMyCropStage } from '../services/api'
import { Card, Spinner, COLORS, StatusPill, Button } from '../components/UI'
import { useLanguage } from '../contexts/LanguageContext'

const VERDICT_BG: Record<string, string> = {
  'HIGHLY SUITABLE': '#dcfce7', SUITABLE: '#f0fdf4', MARGINAL: '#fef9c3', 'NOT RECOMMENDED': '#fee2e2',
}
const VERDICT_TEXT: Record<string, string> = {
  'HIGHLY SUITABLE': '#166534', SUITABLE: '#15803d', MARGINAL: '#92400e', 'NOT RECOMMENDED': '#991b1b',
}

export default function CropAdvisorScreen() {
  const { t, tv, language } = useLanguage()
  const [crops, setCrops] = useState<string[]>([])
  const [myCropStage, setMyCropStage] = useState<any>(null)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    nitrogen: '', phosphorus: '', potassium: '', ph: '',
    temperature: '', moisture: '', previous_crop: '',
  })

  useEffect(() => {
    getCropList().then(setCrops).catch(() => {})
    getMyCropStage().then(setMyCropStage).catch(() => {})
    getSoil().then((s) => {
      if (s?.has_data) {
        setForm((f) => ({
          ...f,
          nitrogen: s.nitrogen?.value ? String(s.nitrogen.value) : f.nitrogen,
          phosphorus: s.phosphorus?.value ? String(s.phosphorus.value) : f.phosphorus,
          potassium: s.potassium?.value ? String(s.potassium.value) : f.potassium,
          ph: s.ph?.value ? String(s.ph.value) : f.ph,
        }))
      }
    }).catch(() => {})
    getWeather().then((w) => {
      if (w) setForm((f) => ({ ...f, temperature: String(w.temperature || ''), moisture: String(w.humidity || '') }))
    }).catch(() => {})
  }, [])

  const setF = (k: string, v: string) => setForm({ ...form, [k]: v })

  const analyze = async () => {
    setLoading(true); setResult(null)
    try {
      const payload: any = { language }
      if (form.nitrogen) payload.nitrogen = +form.nitrogen
      if (form.phosphorus) payload.phosphorus = +form.phosphorus
      if (form.potassium) payload.potassium = +form.potassium
      if (form.ph) payload.ph = +form.ph
      if (form.temperature) payload.temperature = +form.temperature
      if (form.moisture) payload.moisture = +form.moisture
      if (form.previous_crop) payload.previous_crop = form.previous_crop
      const res = await recommendAdvisory(payload)
      setResult(res)
    } finally { setLoading(false) }
  }

  const InputRow = ({ label, field, keyType = 'numeric' }: { label: string; field: string; keyType?: any }) => (
    <View style={ss.inputRow}>
      <Text style={ss.inputLabel}>{label}</Text>
      <TextInput
        style={ss.input}
        value={(form as any)[field]}
        onChangeText={(v) => setF(field, v)}
        keyboardType={keyType}
        placeholderTextColor="#9ca3af"
        placeholder="—"
      />
    </View>
  )

  return (
    <SafeAreaView style={ss.safe}>
      <ScrollView contentContainerStyle={ss.content}>
        <Text style={ss.title}>🌾 {t('nav.crop') || 'Crop Advisor'}</Text>
        <Text style={ss.sub}>AI-powered crop recommendation based on your soil and conditions</Text>

        {/* Current crop stage */}
        {myCropStage?.crop && (
          <Card style={ss.mt}>
            <Text style={ss.cardTitle}>🌱 Current Crop</Text>
            <Text style={ss.bigVal}>{tv(myCropStage.crop)} — {myCropStage.stage}</Text>
            {myCropStage.days_left !== undefined && (
              <Text style={ss.muted}>~{myCropStage.days_left} days to harvest</Text>
            )}
          </Card>
        )}

        {/* Form */}
        <Card style={ss.mt}>
          <Text style={ss.cardTitle}>🧪 Soil & Conditions (pre-filled from your data)</Text>
          <View style={ss.formGrid}>
            <InputRow label="Nitrogen (N)" field="nitrogen" />
            <InputRow label="Phosphorus (P)" field="phosphorus" />
            <InputRow label="Potassium (K)" field="potassium" />
            <InputRow label="pH" field="ph" />
            <InputRow label="Temp (°C)" field="temperature" />
            <InputRow label="Moisture %" field="moisture" />
          </View>
          <View style={ss.inputRow}>
            <Text style={ss.inputLabel}>Previous crop</Text>
            <TextInput
              style={ss.input}
              value={form.previous_crop}
              onChangeText={(v) => setF('previous_crop', v)}
              keyboardType="default"
              placeholderTextColor="#9ca3af"
              placeholder="e.g. wheat"
            />
          </View>
          <TouchableOpacity style={ss.btn} onPress={analyze} disabled={loading}>
            <Text style={ss.btnText}>{loading ? 'Analyzing…' : '🔍 Get Crop Recommendations'}</Text>
          </TouchableOpacity>
        </Card>

        {loading && <Spinner />}

        {/* Results */}
        {result?.rankings?.length > 0 && (
          <View style={ss.mt}>
            <Text style={ss.cardTitle}>📊 Ranked Recommendations</Text>
            {result.rankings.slice(0, 6).map((r: any, i: number) => (
              <Card key={i} style={ss.rankCard}>
                <View style={ss.rankHeader}>
                  <Text style={ss.rankNum}>#{i + 1}</Text>
                  <Text style={ss.rankCrop}>{tv(r.crop)}</Text>
                  <View style={[ss.verdictBadge, { backgroundColor: VERDICT_BG[r.verdict] || '#f3f4f6' }]}>
                    <Text style={[ss.verdictText, { color: VERDICT_TEXT[r.verdict] || '#374151' }]}>{r.verdict}</Text>
                  </View>
                </View>
                <View style={ss.rankBars}>
                  {r.factors && Object.entries(r.factors).slice(0, 4).map(([k, v]: any) => (
                    <View key={k} style={ss.barRow}>
                      <Text style={ss.barLabel}>{k}</Text>
                      <View style={ss.barBg}>
                        <View style={[ss.barFill, {
                          width: `${Math.round(v * 100)}%` as any,
                          backgroundColor: v >= 0.8 ? '#22c55e' : v >= 0.5 ? '#f59e0b' : '#ef4444',
                        }]} />
                      </View>
                      <Text style={ss.barPct}>{Math.round(v * 100)}%</Text>
                    </View>
                  ))}
                </View>
              </Card>
            ))}
          </View>
        )}
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
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.primaryDark, marginBottom: 12 },
  bigVal: { fontSize: 18, fontWeight: '800', color: COLORS.primary },
  muted: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  inputRow: { width: '47%', marginBottom: 4 },
  inputLabel: { fontSize: 11, fontWeight: '700', color: '#6b7280', marginBottom: 4 },
  input: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: COLORS.textPrimary, backgroundColor: '#f9fafb' },
  btn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  rankCard: { marginBottom: 10 },
  rankHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  rankNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primary, color: '#fff', fontWeight: '800', textAlign: 'center', lineHeight: 28, marginRight: 8 },
  rankCrop: { fontSize: 16, fontWeight: '800', color: COLORS.primaryDark, flex: 1 },
  verdictBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  verdictText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  rankBars: { gap: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  barLabel: { width: 60, fontSize: 10, color: COLORS.textMuted },
  barBg: { flex: 1, height: 6, backgroundColor: '#e5e7eb', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  barPct: { width: 28, fontSize: 10, color: COLORS.textMuted, textAlign: 'right' },
})
