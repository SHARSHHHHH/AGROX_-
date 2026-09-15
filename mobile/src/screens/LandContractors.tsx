import React, { useEffect, useState } from "react"
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Alert } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { browseLandListings, requestLandContract } from "../services/api"
import { Card, Spinner, COLORS } from "../components/UI"

export default function LandContractorsScreen() {
  const [listings, setListings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    try {
      const res = await browseLandListings()
      setListings(res.items || res || [])
    } catch (e: any) {
      console.log(e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])

  const rent = (id: number, title: string) => {
    Alert.prompt("Request Contract", `Enter start date (YYYY-MM-DD) for ${title}`, async (date) => {
      if (!date) return
      try {
        await requestLandContract({ listing_id: id, start_date: date })
        Alert.alert("Success", "Contract request sent to owner!")
        load()
      } catch (e: any) {
        Alert.alert("Error", e?.response?.data?.detail || "Failed to request contract")
      }
    })
  }

  if (loading) return <SafeAreaView style={ss.safe}><Spinner /></SafeAreaView>

  return (
    <SafeAreaView style={ss.safe}>
      <ScrollView contentContainerStyle={ss.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load()}} tintColor={COLORS.primary}/>}>
        <Text style={ss.title}>📜 Land Contracts</Text>
        <Text style={ss.subtitle}>Browse land available for seasonal rent</Text>

        {listings.length === 0 && <Card><Text style={ss.empty}>No land listings available right now.</Text></Card>}
        
        {listings.map((l) => (
          <Card key={l.id} style={ss.card}>
            <View style={ss.row}>
              <Text style={ss.listTitle}>{l.title}</Text>
              <Text style={ss.price}>₹{l.price_per_acre_per_season}/acre</Text>
            </View>
            <Text style={ss.meta}>{l.area_acres} Acres · {l.district}, {l.state}</Text>
            <Text style={ss.desc}>{l.description}</Text>
            <View style={ss.tags}>
              <Text style={ss.tag}>Soil: {l.soil_type}</Text>
              <Text style={ss.tag}>Water: {l.water_source}</Text>
            </View>
            <TouchableOpacity style={ss.rentBtn} onPress={() => rent(l.id, l.title)}>
              <Text style={ss.rentText}>Request Contract</Text>
            </TouchableOpacity>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}

const ss = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, gap: 10 },
  title: { fontSize: 22, fontWeight: "800", color: COLORS.primaryDark },
  subtitle: { fontSize: 14, color: COLORS.textMuted, marginBottom: 12 },
  empty: { textAlign: "center", color: COLORS.textMuted, padding: 20 },
  card: { marginBottom: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  listTitle: { fontSize: 16, fontWeight: "700", color: COLORS.primaryDark, flex: 1 },
  price: { fontSize: 16, fontWeight: "800", color: COLORS.primary },
  meta: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  desc: { fontSize: 13, color: "#4b5563", marginTop: 8 },
  tags: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" },
  tag: { backgroundColor: "#f3f4f6", color: "#4b5563", fontSize: 11, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, overflow: "hidden" },
  rentBtn: { backgroundColor: COLORS.primary, paddingVertical: 10, borderRadius: 8, marginTop: 16, alignItems: "center" },
  rentText: { color: "#fff", fontWeight: "700", fontSize: 14 },
})
