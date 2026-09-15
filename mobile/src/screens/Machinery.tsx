import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, Image, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getMachinery, rentMachinery, getMyRentals } from '../services/api'
import { Card, Spinner, COLORS } from '../components/UI'
import { useLanguage } from '../contexts/LanguageContext'
import { getApiBase } from '../services/api'

export default function MachineryScreen() {
  const { t, tv } = useLanguage()
  const [machinery, setMachinery] = useState<any[]>([])
  const [myRentals, setMyRentals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState<'browse' | 'my'>('browse')
  const [search, setSearch] = useState('')

  const load = async () => {
    try {
      const [m, r] = await Promise.all([getMachinery().catch(() => ({ items: [] })), getMyRentals().catch(() => ({ items: [] }))])
      setMachinery(m?.items || m || []); setMyRentals(r?.items || r || [])
    } finally { setLoading(false); setRefreshing(false) }
  }
  useEffect(() => { load() }, [])

  const rent = async (id: number, name: string) => {
    try { 
      const res = await rentMachinery(id); 
      Alert.alert('Contact Owner', `Phone: ${res.contact_phone || 'N/A'}`); 
      load(); 
    } catch (e: any) { 
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to reveal contact') 
    }
  }

  const filtered = machinery.filter((m) => !search || tv(m.name)?.toLowerCase().includes(search.toLowerCase()))

  if (loading) return <SafeAreaView style={ss.safe}><Spinner /></SafeAreaView>

  return (
    <SafeAreaView style={ss.safe}>
      <ScrollView contentContainerStyle={ss.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={COLORS.primary} />}>
        <Text style={ss.title}>🚜 {t('nav.machinery') || 'Machinery'}</Text>

        <View style={ss.tabRow}>
          {(['browse', 'my'] as const).map((t_) => (
            <TouchableOpacity key={t_} onPress={() => setTab(t_)} style={[ss.tab, tab === t_ && ss.tabActive]}>
              <Text style={[ss.tabText, tab === t_ && ss.tabTextActive]}>{t_ === 'browse' ? 'Browse' : 'My Rentals'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'browse' && (
          <>
            <TextInput style={ss.search} value={search} onChangeText={setSearch} placeholder="Search machinery…" placeholderTextColor="#9ca3af" />
            {filtered.length === 0 && <Card><Text style={ss.empty}>No machinery available right now.</Text></Card>}
            {filtered.map((m) => (
              <Card key={m.id} style={ss.machCard}>
                <Text style={ss.machName}>{tv(m.title) || tv(m.machine_key)}</Text>
                <Text style={ss.machMeta}>{m.brand || m.category} · {m.village ? `${m.village}, ` : ''}{m.district}</Text>
                <Text style={ss.machRate}>₹{m.daily_rate}/day</Text>
                {m.description && <Text style={ss.machDesc}>{m.description}</Text>}
                <View style={ss.machFooter}>
                  <View style={[ss.availBadge, { backgroundColor: m.available ? '#dcfce7' : '#fee2e2' }]}>
                    <Text style={[ss.availText, { color: m.available ? COLORS.primary : COLORS.red }]}>
                      {m.available ? 'Available' : 'Booked'}
                    </Text>
                  </View>
                  {m.available && (
                    <TouchableOpacity style={ss.rentBtn} onPress={() => rent(m.id, tv(m.name))}>
                      <Text style={ss.rentBtnText}>Rent</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </Card>
            ))}
          </>
        )}

        {tab === 'my' && (
          <>
            {myRentals.length === 0 && <Card><Text style={ss.empty}>No active rentals.</Text></Card>}
            {myRentals.map((r) => (
              <Card key={r.id} style={ss.machCard}>
                <Text style={ss.machName}>{tv(r.machinery?.name) || `Rental #${r.id}`}</Text>
                <Text style={ss.machMeta}>{r.start_date} → {r.end_date || 'ongoing'}</Text>
                <View style={[ss.availBadge, { backgroundColor: '#eff6ff', alignSelf: 'flex-start' }]}>
                  <Text style={[ss.availText, { color: '#1e40af' }]}>{r.status}</Text>
                </View>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const ss = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, gap: 10 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.primaryDark },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', backgroundColor: '#f9fafb' },
  tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { fontWeight: '700', color: COLORS.textMuted },
  tabTextActive: { color: '#fff' },
  search: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.textPrimary, backgroundColor: '#fff' },
  empty: { textAlign: 'center', color: COLORS.textMuted, padding: 20 },
  machCard: { marginBottom: 4 },
  machName: { fontSize: 16, fontWeight: '800', color: COLORS.primaryDark },
  machMeta: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  machRate: { fontSize: 18, fontWeight: '900', color: COLORS.primary, marginTop: 6 },
  machDesc: { fontSize: 13, color: '#4b5563', marginTop: 4 },
  machFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  availBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  availText: { fontWeight: '700', fontSize: 12 },
  rentBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  rentBtnText: { color: '#fff', fontWeight: '700' },
})
