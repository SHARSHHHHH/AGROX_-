import React, { useEffect, useState } from "react"
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, TextInput, Alert } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { getMyLandListings, createLandListing, deleteLandListing } from "../services/api"
import { Card, Spinner, COLORS } from "../components/UI"

export default function FarmerLandScreen() {
  const [listings, setListings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showForm, setShowForm] = useState(false)
  
  const [form, setForm] = useState({
    title: "", description: "", area_acres: "", price_per_acre_per_season: "", soil_type: "", water_source: ""
  })
  
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const load = async () => {
    try {
      const res = await getMyLandListings()
      setListings(res.items || res || [])
    } catch (e: any) {
      console.log(e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])

  const add = async () => {
    try {
      await createLandListing({
        ...form,
        area_acres: +form.area_acres || 0,
        price_per_acre_per_season: +form.price_per_acre_per_season || 0
      })
      setShowForm(false)
      load()
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.detail || "Failed to add listing")
    }
  }

  const del = (id: number) => {
    Alert.alert("Delete Listing?", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await deleteLandListing(id)
          load()
        } catch(e) {}
      }}
    ])
  }

  if (loading) return <SafeAreaView style={ss.safe}><Spinner /></SafeAreaView>

  return (
    <SafeAreaView style={ss.safe}>
      <ScrollView contentContainerStyle={ss.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load()}} tintColor={COLORS.primary}/>}>
        <View style={ss.hdr}>
          <Text style={ss.title}>🏡 My Land</Text>
          <TouchableOpacity onPress={() => setShowForm(!showForm)} style={ss.addBtn}>
            <Text style={ss.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {showForm && (
          <Card style={ss.mt}>
            {[{ label: "Title (e.g. 5 Acres Fertile Land)", key: "title" },
              { label: "Description", key: "description" },
              { label: "Area (Acres)", key: "area_acres", num: true },
              { label: "Rent Price/Acre/Season (₹)", key: "price_per_acre_per_season", num: true },
              { label: "Soil Type (e.g. Black Cotton)", key: "soil_type" },
              { label: "Water Source (e.g. Tube well)", key: "water_source" }
            ].map(({ label, key, num }) => (
              <TextInput key={key} style={ss.input} value={(form as any)[key]} onChangeText={(v) => set(key, v)} placeholder={label} placeholderTextColor="#9ca3af" keyboardType={num ? "numeric" : "default"} />
            ))}
            <TouchableOpacity style={ss.saveBtn} onPress={add}>
              <Text style={ss.saveBtnText}>Save Listing</Text>
            </TouchableOpacity>
          </Card>
        )}

        {listings.length === 0 && <Card><Text style={ss.empty}>You have not listed any land.</Text></Card>}
        
        {listings.map((l) => (
          <Card key={l.id} style={ss.card}>
            <View style={ss.row}>
              <Text style={ss.listTitle}>{l.title}</Text>
              <Text style={ss.status}>{l.status}</Text>
            </View>
            <Text style={ss.meta}>{l.area_acres} Acres · ₹{l.price_per_acre_per_season}/acre</Text>
            <Text style={ss.desc}>{l.description}</Text>
            <Text style={ss.features}>Soil: {l.soil_type} · Water: {l.water_source}</Text>
            <TouchableOpacity style={ss.delBtn} onPress={() => del(l.id)}><Text style={ss.delText}>Delete</Text></TouchableOpacity>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}

const ss = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, gap: 10 },
  hdr: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  title: { fontSize: 22, fontWeight: "800", color: COLORS.primaryDark },
  addBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: "#fff", fontWeight: "700" },
  mt: { marginTop: 4 },
  input: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.textPrimary, backgroundColor: "#f9fafb", marginBottom: 8 },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "800" },
  empty: { textAlign: "center", color: COLORS.textMuted, padding: 20 },
  card: { marginBottom: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  listTitle: { fontSize: 16, fontWeight: "700", color: COLORS.primaryDark, flex: 1 },
  status: { fontSize: 11, fontWeight: "700", color: "#059669", backgroundColor: "#d1fae5", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: "hidden" },
  meta: { fontSize: 14, fontWeight: "600", color: COLORS.primary, marginTop: 4 },
  desc: { fontSize: 13, color: "#4b5563", marginTop: 4 },
  features: { fontSize: 12, color: "#6b7280", marginTop: 4 },
  delBtn: { marginTop: 12, alignSelf: "flex-start" },
  delText: { color: COLORS.red, fontSize: 12, fontWeight: "600" },
})
