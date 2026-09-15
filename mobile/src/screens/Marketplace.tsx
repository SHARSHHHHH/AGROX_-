import React, { useEffect, useState } from "react"
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, RefreshControl } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { getListings } from "../services/api"
import { Card, Spinner, COLORS } from "../components/UI"
import { useLanguage } from "../contexts/LanguageContext"

export default function MarketplaceScreen() {
  const { t, tv } = useLanguage()
  const [listings, setListings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState("")
  const load = async () => { try { setListings(await getListings({q:search||undefined})) } catch {} finally { setLoading(false); setRefreshing(false) } }
  useEffect(() => { load() }, [])
  const filtered = listings.filter((l)=>!search||tv(l.crop)?.toLowerCase().includes(search.toLowerCase()))
  if (loading) return <SafeAreaView style={ss.safe}><Spinner /></SafeAreaView>
  return (
    <SafeAreaView style={ss.safe}>
      <ScrollView contentContainerStyle={ss.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load()}} tintColor={COLORS.primary}/>}>
        <Text style={ss.title}>🛒 Marketplace</Text>
        <TextInput style={ss.search} value={search} onChangeText={setSearch} placeholder="Search crops…" placeholderTextColor="#9ca3af"/>
        {filtered.length===0&&<Card><Text style={ss.empty}>No listings found.</Text></Card>}
        {filtered.map((l)=>(<Card key={l.id} style={ss.card}>
          <View style={ss.row}>
            <View style={{flex:1}}>
              <Text style={ss.crop}>{tv(l.crop)}</Text>
              <Text style={ss.meta}>{l.seller_name} · {l.location}</Text>
              <Text style={ss.qty}>{l.quantity} {l.unit} available</Text>
            </View>
            <Text style={ss.price}>₹{l.price_per_unit}/{l.unit}</Text>
          </View>
          {l.description&&<Text style={ss.desc}>{l.description}</Text>}
        </Card>))}
      </ScrollView>
    </SafeAreaView>
  )
}
const ss = StyleSheet.create({
  safe:{flex:1,backgroundColor:COLORS.bg},content:{padding:16,gap:10},title:{fontSize:22,fontWeight:"800",color:COLORS.primaryDark},
  search:{borderWidth:1.5,borderColor:COLORS.border,borderRadius:10,paddingHorizontal:12,paddingVertical:10,fontSize:14,color:COLORS.textPrimary,backgroundColor:"#fff",marginBottom:4},
  empty:{textAlign:"center",color:COLORS.textMuted,padding:20},card:{marginBottom:4},
  row:{flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start"},crop:{fontSize:16,fontWeight:"700",color:COLORS.primaryDark},meta:{fontSize:12,color:COLORS.textMuted,marginTop:2},qty:{fontSize:13,color:"#4b5563",marginTop:2},price:{fontSize:22,fontWeight:"900",color:COLORS.primary},
  desc:{fontSize:12,color:"#4b5563",marginTop:6},
})
