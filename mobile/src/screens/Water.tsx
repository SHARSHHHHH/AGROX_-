import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getLatestSensor, getIrrigation, controlPump, logIrrigation, getSensorHistory } from '../services/api'
import { Card, Button, Spinner, StatusPill, StatCard, COLORS } from '../components/UI'
import { rainLikelihoodFromHumidity } from '../utils/rain'
import { useLanguage } from '../contexts/LanguageContext'

export default function WaterScreen() {
  const { t } = useLanguage()
  const [sensor, setSensor] = useState<any>(null)
  const [irr, setIrr] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [pumpState, setPumpState] = useState('OFF')
  const [msg, setMsg] = useState('')

  const load = async () => {
    try {
      const [s, i, h] = await Promise.all([
        getLatestSensor().catch(() => null),
        getIrrigation().catch(() => null),
        getSensorHistory().catch(() => []),
      ])
      setSensor(s); setIrr(i); setHistory(h || [])
    } finally { setLoading(false); setRefreshing(false) }
  }
  useEffect(() => { load() }, [])

  const togglePump = async (state: string) => {
    const res = await controlPump(state)
    setPumpState(state); setMsg(res.note || `Pump ${state}`)
  }

  const logRun = async () => {
    if (!irr?.duration_min) return
    await logIrrigation(irr.duration_min)
    setMsg(`Logged irrigation of ${irr.duration_min} min.`)
  }

  if (loading) return <SafeAreaView style={ss.safe}><Spinner /></SafeAreaView>

  const rain = rainLikelihoodFromHumidity(sensor?.humidity)

  return (
    <SafeAreaView style={ss.safe}>
      <ScrollView contentContainerStyle={ss.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={COLORS.primary} />}>
        <Text style={ss.title}>💧 Water & Irrigation</Text>
        <Text style={ss.sub}>{t('water.subtitle') || 'Monitor and control water usage'}</Text>

        {/* Stats */}
        <View style={ss.grid}>
          <View style={ss.half}><StatCard label="Soil Moisture" icon="💧" value={sensor?.soil_moisture ?? '—'} unit="%" status={irr?.status} /></View>
          <View style={ss.half}><StatCard label="Water Tank" icon="🪣" value={sensor?.water_level ?? '—'} unit="%" status={sensor?.water_level < 20 ? 'CRITICAL' : undefined} /></View>
        </View>
        <StatCard label="Humidity" icon="💨" value={sensor?.humidity ?? '—'} unit="%"
          recommendation={rain ? `${rain.icon} ${rain.label} — from the humidity sensor, not the weather forecast below.` : undefined} />

        {/* Recommendation */}
        <Card style={ss.mt}>
          <View style={ss.row}>
            <Text style={ss.cardTitle}>{t('common.recommendation') || 'Recommendation'}</Text>
            {irr?.priority && <StatusPill status={irr.priority} />}
          </View>
          {irr?.irrigate !== undefined ? (
            <>
              <Text style={[ss.bigVal, { color: irr.irrigate ? '#b45309' : COLORS.primary }]}>
                {irr.irrigate ? `Irrigate ~${irr.duration_min} min` : 'No irrigation needed'}
              </Text>
              <Text style={ss.body}>{irr.reason}</Text>
              {irr.irrigate && (
                <TouchableOpacity style={ss.btn} onPress={logRun}>
                  <Text style={ss.btnText}>{t('water.log') || 'Log Irrigation'}</Text>
                </TouchableOpacity>
              )}
            </>
          ) : <Text style={ss.muted}>{t('water.norec') || 'No recommendation yet'}</Text>}
        </Card>

        {/* Pump */}
        <Card style={ss.mt}>
          <Text style={ss.cardTitle}>{t('water.pump') || 'Pump Control'}</Text>
          <Text style={ss.muted}>Manual control only. Automated pump control requires safety approval.</Text>
          <View style={ss.pumpRow}>
            <TouchableOpacity
              style={[ss.pumpBtn, pumpState === 'ON' && ss.pumpBtnOn]}
              onPress={() => togglePump('ON')}>
              <Text style={ss.pumpBtnText}>{t('water.turnon') || 'Turn ON'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ss.pumpBtn, pumpState === 'OFF' && ss.pumpBtnOff]}
              onPress={() => togglePump('OFF')}>
              <Text style={ss.pumpBtnText}>{t('water.turnoff') || 'Turn OFF'}</Text>
            </TouchableOpacity>
          </View>
          {msg ? <Text style={ss.muted}>{msg}</Text> : null}
        </Card>

        {/* History mini-chart — recent sensor readings */}
        {history.length > 0 && (
          <Card style={ss.mt}>
            <Text style={ss.cardTitle}>{t('water.recent') || 'Recent Readings'}</Text>
            <View style={ss.chart}>
              {history.slice(-20).map((h, i) => (
                <View key={i} style={[ss.bar, { height: `${Math.min(100, h.soil_moisture || 0)}%` as any }]} />
              ))}
            </View>
            <Text style={ss.muted}>Last {Math.min(20, history.length)} readings · Source: {history[history.length - 1]?.source}</Text>
          </Card>
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
  grid: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  mt: { marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.primaryDark },
  bigVal: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  body: { fontSize: 13, color: '#4b5563' },
  muted: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  btn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, marginTop: 10, alignSelf: 'flex-start' },
  btnText: { color: '#fff', fontWeight: '700' },
  pumpRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  pumpBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', backgroundColor: '#f9fafb' },
  pumpBtnOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pumpBtnOff: { backgroundColor: '#ef4444', borderColor: '#ef4444' },
  pumpBtnText: { fontWeight: '700', color: '#fff' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 2, marginVertical: 8 },
  bar: { flex: 1, backgroundColor: COLORS.primaryLight, borderRadius: 2 },
})
