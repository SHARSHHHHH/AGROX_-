import React, { useEffect, useState } from "react"
import { View, Text, ScrollView, StyleSheet, RefreshControl } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { getAdminStats } from "../services/api"
import { Card, Spinner, COLORS } from "../components/UI"

export default function AdminScreen() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const load = async () => { try { setStats(await getAdminStats()) } catch {} finally { setLoading(false); setRefreshing(false) } }
  useEffect(()=>{load()},[])
  if (loading) return <SafeAreaView style={ss.safe}><Spinner /></SafeAreaView>
  return (
    <SafeAreaView style={ss.safe}>
      <ScrollView contentContainerStyle={ss.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load()}} tintColor={COLORS.primary}/>}>
        <Text style={ss.title}>🏛️ Admin Dashboard</Text>
        {!stats&&<Card><Text style={ss.empty}>No stats available.</Text></Card>}
        {stats&&(<>
          <View style={ss.grid}>
            {[{label:"Users",val:stats.total_users||0,emoji:"👤"},{label:"Farmers",val:stats.total_farmers||0,emoji:"🧑‍🌾"},{label:"Buyers",val:stats.total_buyers||0,emoji:"🛒"},{label:"Alerts",val:stats.total_alerts||0,emoji:"🚨"}].map((i)=>(<View key={i.label} style={ss.statBox}><Text style={ss.statEmoji}>{i.emoji}</Text><Text style={ss.statNum}>{i.val}</Text><Text style={ss.statLabel}>{i.label}</Text></View>))}
          </View>
          {stats.alerts_by_state&&(<Card style={ss.mt}><Text style={ss.secTitle}>Alerts by State</Text>{Object.entries(stats.alerts_by_state).slice(0,8).map(([s,c]:any)=>(<View key={s} style={ss.row}><Text style={ss.rowLabel}>{s}</Text><Text style={ss.rowVal}>{c}</Text></View>))}</Card>)}
        </>)}
      </ScrollView>
    </SafeAreaView>
  )
}
const ss = StyleSheet.create({
  safe:{flex:1,backgroundColor:COLORS.bg},content:{padding:16,gap:12},title:{fontSize:22,fontWeight:"800",color:COLORS.primaryDark},
  empty:{textAlign:"center",color:COLORS.textMuted,padding:20},
  grid:{flexDirection:"row",flexWrap:"wrap",gap:10},statBox:{width:"47%",backgroundColor:"#fff",borderRadius:14,padding:16,alignItems:"center",borderWidth:1,borderColor:COLORS.border},statEmoji:{fontSize:28},statNum:{fontSize:28,fontWeight:"900",color:COLORS.primaryDark},statLabel:{fontSize:11,color:COLORS.textMuted,marginTop:2},
  mt:{},secTitle:{fontSize:15,fontWeight:"700",color:COLORS.primaryDark,marginBottom:10},row:{flexDirection:"row",justifyContent:"space-between",paddingVertical:6,borderBottomWidth:1,borderBottomColor:COLORS.border},rowLabel:{fontSize:13,color:"#374151"},rowVal:{fontSize:13,fontWeight:"700",color:COLORS.primaryDark},
})
