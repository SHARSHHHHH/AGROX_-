import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getAnalytics, addExpense, deleteExpense } from '../services/api'
import { Card, Spinner, COLORS } from '../components/UI'
import { useLanguage } from '../contexts/LanguageContext'

export default function AnalyticsScreen() {
  const { t } = useLanguage()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = () => {
    getAnalytics().then(setData).finally(() => { setLoading(false); setRefreshing(false) })
  }
  useEffect(load, [])

  if (loading) return <SafeAreaView style={ss.safe}><Spinner /></SafeAreaView>

  return (
    <SafeAreaView style={ss.safe}>
      <ScrollView contentContainerStyle={ss.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={COLORS.primary} />}>
        <Text style={ss.title}>📈 Analytics</Text>
        {data?.insight && <Text style={ss.insight}>{data.insight}</Text>}

        {/* Sensor History mini-chart */}
        {data?.series?.length > 0 && (
          <Card style={ss.mt}>
            <Text style={ss.cardTitle}>💧 Soil Moisture History</Text>
            <View style={ss.chart}>
              {data.series.slice(-20).map((d: any, i: number) => (
                <View key={i} style={[ss.bar, { height: `${Math.min(100, d.soil_moisture || 0)}%` as any, backgroundColor: d.soil_moisture > 60 ? COLORS.primary : d.soil_moisture > 30 ? '#f59e0b' : '#ef4444' }]} />
              ))}
            </View>
            <Text style={ss.muted}>Last {Math.min(20, data.series.length)} readings</Text>
          </Card>
        )}

        {/* Crops summary */}
        {data?.crops && (
          <Card style={ss.mt}>
            <Text style={ss.cardTitle}>🌾 Crop Summary</Text>
            <View style={ss.grid}>
              {[
                { label: 'Sowed', val: data.crops.sowed, emoji: '🌱' },
                { label: 'Growing', val: data.crops.growing, emoji: '🌿' },
                { label: 'Matured', val: data.crops.grown, emoji: '🌾' },
              ].map((item) => (
                <View key={item.label} style={ss.statBox}>
                  <Text style={ss.statEmoji}>{item.emoji}</Text>
                  <Text style={ss.statNum}>{item.val || 0}</Text>
                  <Text style={ss.statLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
            {data.crops.analysis && <Text style={ss.muted}>{data.crops.analysis}</Text>}
          </Card>
        )}

        {/* Finance */}
        {data?.finance && (
          <Card style={ss.mt}>
            <Text style={ss.cardTitle}>💰 Finance Summary</Text>
            <View style={ss.grid}>
              {[
                { label: 'Earned', val: `₹${data.finance.earned}`, color: COLORS.primary },
                { label: 'Spent', val: `₹${data.finance.spent}`, color: '#dc2626' },
                { label: 'Net', val: `₹${data.finance.net}`, color: data.finance.net >= 0 ? COLORS.primary : '#dc2626' },
              ].map((item) => (
                <View key={item.label} style={ss.finBox}>
                  <Text style={[ss.finVal, { color: item.color }]}>{item.val}</Text>
                  <Text style={ss.statLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* Recent expenses */}
        {data?.expenses?.length > 0 && (
          <Card style={ss.mt}>
            <Text style={ss.cardTitle}>🧾 Recent Expenses</Text>
            {data.expenses.slice(0, 8).map((e: any) => (
              <View key={e.id} style={ss.expRow}>
                <View>
                  <Text style={ss.expCat}>{e.category}</Text>
                  {e.note && <Text style={ss.muted}>{e.note}</Text>}
                </View>
                <Text style={ss.expAmt}>₹{e.amount}</Text>
              </View>
            ))}
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
  insight: { fontSize: 13, color: '#4b5563', fontStyle: 'italic' },
  mt: { marginTop: 4 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.primaryDark, marginBottom: 12 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 2 },
  bar: { flex: 1, borderRadius: 2 },
  muted: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  grid: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  statBox: { flex: 1, alignItems: 'center', backgroundColor: '#f0faf4', borderRadius: 12, padding: 12 },
  statEmoji: { fontSize: 22 },
  statNum: { fontSize: 24, fontWeight: '900', color: COLORS.primaryDark },
  statLabel: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  finBox: { flex: 1, alignItems: 'center', backgroundColor: '#f9fafb', borderRadius: 12, padding: 12 },
  finVal: { fontSize: 18, fontWeight: '800' },
  expRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  expCat: { fontWeight: '600', color: COLORS.textPrimary, textTransform: 'capitalize' },
  expAmt: { fontWeight: '800', color: '#dc2626' },
})
