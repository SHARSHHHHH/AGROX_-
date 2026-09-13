import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, FlatList, TouchableOpacity, TextInput, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getMarketPrices } from '../services/api'
import { Card, Spinner, COLORS } from '../components/UI'
import { useLanguage } from '../contexts/LanguageContext'

export default function MarketScreen() {
  const { t, tv } = useLanguage()
  const [prices, setPrices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [state, setState] = useState('')

  const load = async () => {
    try {
      const res = await getMarketPrices({ crops: search || 'wheat,rice,tomato,potato,onion,cotton,sugarcane', state: state || undefined })
      const mappedPrices: any[] = [];
      if (res && res.results) {
        Object.values(res.results).forEach((r: any) => {
          if (r.prices) {
            mappedPrices.push({
              commodity: r.crop,
              market: r.prices.mandi || 'Local Mandi',
              district: 'General',
              state: res.state || 'Madhya Pradesh',
              modal_price: r.prices.modal,
              min_price: r.prices.min,
              max_price: r.prices.max,
              date: r.fetched_on,
            })
          }
        });
      }
      setPrices(mappedPrices)
    } finally { setLoading(false); setRefreshing(false) }
  }
  useEffect(() => { load() }, [])

  const filtered = prices.filter((p) =>
    !search || p.commodity?.toLowerCase().includes(search.toLowerCase()) || p.district?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <SafeAreaView style={ss.safe}><Spinner /></SafeAreaView>

  return (
    <SafeAreaView style={ss.safe}>
      <ScrollView contentContainerStyle={ss.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={COLORS.primary} />}>
        <Text style={ss.title}>💰 {t('nav.market') || 'Market Prices'}</Text>
        <View style={ss.searchRow}>
          <TextInput style={[ss.input, { flex: 1 }]} value={search} onChangeText={setSearch}
            placeholder="Search crop or district…" placeholderTextColor="#9ca3af" />
          <TextInput style={[ss.input, { width: 120, marginLeft: 8 }]} value={state} onChangeText={setState}
            placeholder="State" placeholderTextColor="#9ca3af" />
          <TouchableOpacity onPress={load} style={ss.searchBtn}><Text style={ss.searchBtnText}>Go</Text></TouchableOpacity>
        </View>

        {filtered.slice(0, 50).map((p, i) => (
          <Card key={i} style={ss.priceCard}>
            <View style={ss.priceRow}>
              <View style={{ flex: 1 }}>
                <Text style={ss.commodity}>{tv(p.commodity)}</Text>
                <Text style={ss.meta}>{p.market} · {p.district}, {p.state}</Text>
              </View>
              <View style={ss.priceWrap}>
                <Text style={ss.price}>₹{p.modal_price}</Text>
                <Text style={ss.priceUnit}>/quintal</Text>
              </View>
            </View>
            <View style={ss.priceRange}>
              <Text style={ss.rangeTxt}>Min: ₹{p.min_price}</Text>
              <Text style={ss.rangeTxt}>Max: ₹{p.max_price}</Text>
              <Text style={[ss.rangeTxt, { color: COLORS.textMuted }]}>{p.date}</Text>
            </View>
          </Card>
        ))}
        {filtered.length === 0 && <Text style={ss.empty}>No market prices found. Try adjusting filters.</Text>}
      </ScrollView>
    </SafeAreaView>
  )
}

const ss = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, gap: 10 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.primaryDark },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  input: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.textPrimary, backgroundColor: '#fff' },
  searchBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  searchBtnText: { color: '#fff', fontWeight: '700' },
  priceCard: { padding: 12 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  commodity: { fontSize: 15, fontWeight: '700', color: COLORS.primaryDark },
  meta: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  priceWrap: { alignItems: 'flex-end' },
  price: { fontSize: 20, fontWeight: '900', color: COLORS.primary },
  priceUnit: { fontSize: 11, color: COLORS.textMuted },
  priceRange: { flexDirection: 'row', gap: 12, marginTop: 8 },
  rangeTxt: { fontSize: 12, color: '#4b5563' },
  empty: { textAlign: 'center', color: COLORS.textMuted, padding: 32 },
})
