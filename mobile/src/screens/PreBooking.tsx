import React, { useEffect, useState } from "react"
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, TextInput, RefreshControl } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { getPreBookings, createPreBooking, cancelPreBooking, browseHarvests } from "../services/api"
import { Card, Spinner, COLORS } from "../components/UI"
import { useLanguage } from "../contexts/LanguageContext"

export default function PreBookingScreen() {
  const { t, tv } = useLanguage()
  const [tab, setTab] = useState<"browse"|"my">("browse")
  const [harvests, setHarvests] = useState<any[]>([])
  const [myBookings, setMyBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState("")
  const load = async () => {
    try {
      const [h,b] = await Promise.all([browseHarvests({q:search||undefined}).catch(()=>[]), getPreBookings().catch(()=>[])])
      setHarvests(h||[]); setMyBookings(b||[])
    } finally { setLoading(false); setRefreshing(false) }
  }
  useEffect(()=>{load()},[])
  const book = async (harvestId:number, crop:string) => {
    Alert.alert("Pre-book harvest?",`Book "${tv(crop)}"?`,[
      {text:"Cancel",style:"cancel"},
      {text:"Book",onPress:async()=>{ try{await createPreBooking({harvest_id:harvestId,quantity:1,unit:"kg"});load()}catch(e:any){Alert.alert("Error",e?.response?.data?.detail||"Failed")} }}
    ])
  }
  const cancel = async (id:number) => {
    Alert.alert("Cancel booking?","",[ {text:"No",style:"cancel"},{text:"Cancel",style:"destructive",onPress:async()=>{await cancelPreBooking(id);load()}}])
  }
  if (loading) return <SafeAreaView style={ss.safe}><Spinner /></SafeAreaView>
  return (
    <SafeAreaView style={ss.safe}>
      <ScrollView contentContainerStyle={ss.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load()}} tintColor={COLORS.primary}/>}>
        <Text style={ss.title}>📅 Pre-Booking</Text>
        <View style={ss.tabRow}>
          {(["browse","my"] as const).map((t_)=>(<TouchableOpacity key={t_} onPress={()=>setTab(t_)} style={[ss.tab,tab===t_&&ss.tabActive]}><Text style={[ss.tabText,tab===t_&&ss.tabTextActive]}>{t_==="browse"?"Browse Harvests":"My Bookings"}</Text></TouchableOpacity>))}
        </View>
        {tab==="browse"&&(
          <>
            <TextInput style={ss.search} value={search} onChangeText={setSearch} placeholder="Search crop…" placeholderTextColor="#9ca3af"/>
            {harvests.length===0&&<Card><Text style={ss.empty}>No upcoming harvests listed.</Text></Card>}
            {harvests.map((h)=>(<Card key={h.id} style={ss.card}><Text style={ss.crop}>{tv(h.crop)}</Text><Text style={ss.meta}>{h.farmer_name} · {h.harvest_date}</Text><Text style={ss.qty}>Expected: {h.expected_yield}kg</Text><TouchableOpacity onPress={()=>book(h.id,h.crop)} style={ss.bookBtn}><Text style={ss.bookBtnText}>Pre-book</Text></TouchableOpacity></Card>))}
          </>
        )}
        {tab==="my"&&(
          <>
            {myBookings.length===0&&<Card><Text style={ss.empty}>No bookings yet.</Text></Card>}
            {myBookings.map((b)=>(<Card key={b.id} style={ss.card}><Text style={ss.crop}>{tv(b.harvest?.crop||"Harvest")}</Text><Text style={ss.meta}>Status: {b.status}</Text><Text style={ss.qty}>Qty: {b.quantity} {b.unit}</Text>{b.status==="pending"&&(<TouchableOpacity onPress={()=>cancel(b.id)}><Text style={ss.cancelText}>Cancel booking</Text></TouchableOpacity>)}</Card>))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
const ss = StyleSheet.create({
  safe:{flex:1,backgroundColor:COLORS.bg},content:{padding:16,gap:10},title:{fontSize:22,fontWeight:"800",color:COLORS.primaryDark},
  tabRow:{flexDirection:"row",gap:8,marginBottom:4},tab:{flex:1,paddingVertical:10,borderRadius:10,borderWidth:1.5,borderColor:COLORS.border,alignItems:"center",backgroundColor:"#f9fafb"},tabActive:{backgroundColor:COLORS.primary,borderColor:COLORS.primary},tabText:{fontWeight:"700",color:COLORS.textMuted},tabTextActive:{color:"#fff"},
  search:{borderWidth:1.5,borderColor:COLORS.border,borderRadius:10,paddingHorizontal:12,paddingVertical:10,fontSize:14,color:COLORS.textPrimary,backgroundColor:"#fff",marginBottom:4},
  empty:{textAlign:"center",color:COLORS.textMuted,padding:20},card:{marginBottom:4},crop:{fontSize:16,fontWeight:"700",color:COLORS.primaryDark},meta:{fontSize:12,color:COLORS.textMuted,marginTop:2},qty:{fontSize:13,color:"#4b5563",marginTop:2},
  bookBtn:{marginTop:10,backgroundColor:COLORS.primary,borderRadius:8,paddingVertical:8,paddingHorizontal:14,alignSelf:"flex-start"},bookBtnText:{color:"#fff",fontWeight:"700"},
  cancelText:{color:COLORS.red,fontSize:12,fontWeight:"600",marginTop:8},
})
