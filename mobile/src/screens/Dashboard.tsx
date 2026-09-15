import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getLatestSensor, getIrrigation, getSoil, getWeather, getUser, simulateSensor, setScenario, getSensorHistory } from '../services/api'
import { StatCard, Card, Spinner, Button, StatusPill, COLORS } from '../components/UI'
import { rainLikelihoodFromHumidity } from '../utils/rain'
import { useLanguage } from '../contexts/LanguageContext'

const SCENARIOS = [
  ['normal', 'Normal'], ['dry_soil', 'Dry soil'], ['heavy_rain', 'Heavy rain'],
  ['low_water', 'Low water'], ['high_temp', 'High temp'],
]

export default function DashboardScreen() {
  const { t } = useLanguage()
  const [user, setUser] = useState<any>(null)
  const [sensor, setSensor] = useState<any>(null)
  const [irr, setIrr] = useState<any>(null)
  const [soil, setSoil] = useState<any>(null)
  const [weather, setWeather] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [scenario, setScen] = useState('normal')

  useEffect(() => {
    getUser().then((u) => setUser(u))
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const [s, i, so, w, h] = await Promise.all([
        getLatestSensor().catch(() => null),
        getIrrigation().catch(() => null),
        getSoil().catch(() => null),
        getWeather().catch(() => null),
        getSensorHistory().catch(() => []),
      ])
      setSensor(s); setIrr(i); setSoil(so); setWeather(w); setHistory(h || [])
    } finally { setLoading(false); setRefreshing(false) }
  }

  const runScenario = async (name: string) => {
    setScen(name)
    await setScenario(name)
    await simulateSensor(); await simulateSensor(); await simulateSensor()
    await load()
  }

  if (loading) return <SafeAreaView style={ss.safe}><Spinner /></SafeAreaView>

  const moisture = sensor?.soil_moisture
  const isBalcony = user?.mode === 'balcony'
  const rain = rainLikelihoodFromHumidity(sensor?.humidity)

  return (
    <SafeAreaView style={ss.safe}>
      <ScrollView
        style={ss.scroll}
        contentContainerStyle={ss.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={COLORS.primary} />}
      >
        {/* Header */}
        <View style={ss.header}>
          <View>
            <Text style={ss.greeting}>Namaste, {user?.name?.split(' ')[0]} 🌱</Text>
            <Text style={ss.greetingSub}>
              {isBalcony ? 'Your garden status' : 'Your farm status'}
            </Text>
          </View>
        </View>

        {/* Demo scenarios */}
        <Card style={ss.scenarioCard}>
          <Text style={ss.scenLabel}>🎬 Demo scenario:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={ss.scenScroll}>
            {SCENARIOS.map(([v, l]) => (
              <TouchableOpacity
                key={v}
                onPress={() => runScenario(v)}
                style={[ss.scenBtn, scenario === v && ss.scenBtnActive]}
              >
                <Text style={[ss.scenBtnText, scenario === v && ss.scenBtnTextActive]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Card>

        {/* Stat cards grid */}
        <View style={ss.grid}>
          <View style={ss.gridItem}>
            <StatCard label={t('dash.soilmoisture') || 'Soil Moisture'} icon="💧"
              value={moisture ?? '—'} unit="%" status={irr?.status}
              recommendation={irr?.reason?.slice(0, 80)} />
          </View>
          <View style={ss.gridItem}>
            <StatCard label={t('dash.temperature') || 'Temperature'} icon="🌡️"
              value={sensor?.temperature ?? '—'} unit="°C" />
          </View>
          <View style={ss.gridItem}>
            <StatCard label={t('dash.humidity') || 'Humidity'} icon="💨"
              value={sensor?.humidity ?? '—'} unit="%"
              recommendation={rain ? `${rain.icon} ${rain.label}` : undefined} />
          </View>
          <View style={ss.gridItem}>
            <StatCard label={t('dash.watertank') || 'Water Tank'} icon="🪣"
              value={sensor?.water_level ?? '—'} unit="%"
              status={sensor?.water_level < 20 ? 'CRITICAL' : undefined} />
          </View>
        </View>

        {/* Irrigation */}
        <Card style={ss.infoCard}>
          <View style={ss.infoRow}>
            <Text style={ss.infoTitle}>💧 Irrigation</Text>
            {irr?.priority && <StatusPill status={irr.priority} />}
          </View>
          {irr?.irrigate !== undefined ? (
            <>
              <Text style={[ss.infoValue, { color: irr.irrigate ? '#b45309' : COLORS.primary }]}>
                {irr.irrigate ? `Irrigate ~${irr.duration_min} min` : 'No irrigation needed'}
              </Text>
              <Text style={ss.infoBody}>{irr.reason}</Text>
            </>
          ) : <Text style={ss.infoMuted}>{t('dash.norec') || 'No recommendation yet'}</Text>}
        </Card>

        {/* Weather */}
        <Card style={ss.infoCard}>
          <Text style={ss.infoTitle}>🌤️ Weather</Text>
          {weather ? (
            <>
              <Text style={ss.infoValue}>{weather.condition}</Text>
              <Text style={ss.infoBody}>{weather.temperature}°C · Rain {weather.rain_probability}%</Text>
              <Text style={ss.infoMuted}>{weather.interpretation}</Text>
              <Text style={[ss.infoMuted, { fontSize: 11 }]}>Source: {weather.source}</Text>
            </>
          ) : <Text style={ss.infoMuted}>{t('dash.noweather') || 'No weather data'}</Text>}
        </Card>

        {/* Soil */}
        {soil?.has_data && (
          <Card style={ss.infoCard}>
            <Text style={ss.infoTitle}>🧱 Soil Health</Text>
            <View style={ss.soilRow}>
              {[
                { label: 'Overall', value: soil.overall },
                { label: 'N', value: soil.nitrogen?.status },
                { label: 'P', value: soil.phosphorus?.status },
                { label: 'K', value: soil.potassium?.status },
                { label: 'pH', value: `${soil.ph?.value} ${soil.ph?.status}` },
              ].map((item) => (
                <View key={item.label} style={ss.soilItem}>
                  <Text style={ss.soilLabel}>{item.label}</Text>
                  <Text style={ss.soilValue}>{item.value}</Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* Recent Readings — real sensor history from the database, same
            source as the Water & Irrigation screen's chart. */}
        {history.length > 0 && (
          <Card style={ss.infoCard}>
            <Text style={ss.infoTitle}>{t('water.recent') || 'Recent Readings'}</Text>
            <View style={ss.chart}>
              {history.slice(-20).map((h, i) => (
                <View key={i} style={[ss.bar, { height: `${Math.min(100, h.soil_moisture || 0)}%` as any }]} />
              ))}
            </View>
            <Text style={ss.infoMuted}>
              Last {Math.min(20, history.length)} readings · Source: {history[history.length - 1]?.source}
            </Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const ss = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  greeting: { fontSize: 22, fontWeight: '800', color: COLORS.primaryDark },
  greetingSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  scenarioCard: { marginBottom: 4 },
  scenLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 },
  scenScroll: { flexDirection: 'row' },
  scenBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
    borderColor: COLORS.border, backgroundColor: '#fff', marginRight: 8,
  },
  scenBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  scenBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.primary },
  scenBtnTextActive: { color: '#fff' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  gridItem: { width: '47%' },
  infoCard: { marginBottom: 4 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  infoTitle: { fontSize: 15, fontWeight: '700', color: COLORS.primaryDark },
  infoValue: { fontSize: 18, fontWeight: '800', color: COLORS.primaryDark, marginBottom: 4 },
  infoBody: { fontSize: 13, color: '#4b5563', lineHeight: 20 },
  infoMuted: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  soilRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  soilItem: { backgroundColor: '#f0faf4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  soilLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600' },
  soilValue: { fontSize: 13, fontWeight: '700', color: COLORS.primaryDark },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 2, marginVertical: 8 },
  bar: { flex: 1, backgroundColor: COLORS.primaryLight, borderRadius: 2 },
})
