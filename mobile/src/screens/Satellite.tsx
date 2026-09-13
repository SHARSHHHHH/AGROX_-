import React, { useEffect, useState } from "react"
import { View, Text, ScrollView, StyleSheet, RefreshControl } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { getSatelliteData } from "../services/api"
import { Card, Spinner, COLORS } from "../components/UI"
import { useLanguage } from "../contexts/LanguageContext"

export default function SatelliteScreen() {
  const { t } = useLanguage()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const load = async () => { try { setData(await getSatelliteData()) } catch {} finally { setLoading(false); setRefreshing(false) } }
  useEffect(()=>{load()},[])
  if (loading) return <SafeAreaView style={ss.safe}><Spinner /></SafeAreaView>
  return (
    <SafeAreaView style={ss.safe}>
      <ScrollView contentContainerStyle={ss.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load()}} tintColor={COLORS.primary}/>}>
        <Text style={ss.title}>🛰️ Satellite Data (NDVI)</Text>
        {!data&&<Card><Text style={ss.empty}>Loading satellite data...</Text></Card>}
        {data?.status === 'no_location' && (
          <Card><Text style={ss.empty}>{data.message || 'Configure coordinates in Farm Setup to get NDVI data.'}</Text></Card>
        )}
        {data && data.status !== 'no_location' && (<>
          <Card style={ss.mt}><Text style={ss.cardTitle}>NDVI Analysis</Text>
            <View style={ss.grid}>
              {data.current_ndvi!==undefined&&<View style={ss.stat}><Text style={ss.statNum}>{data.current_ndvi?.toFixed(3)}</Text><Text style={ss.statLabel}>Current NDVI</Text></View>}
              {data.avg_ndvi!==undefined&&<View style={ss.stat}><Text style={ss.statNum}>{data.avg_ndvi?.toFixed(3)}</Text><Text style={ss.statLabel}>Avg NDVI</Text></View>}
            </View>
            {data.health_status&&<Text style={ss.health}>{data.health_status}</Text>}
            {data.interpretation&&<Text style={ss.interp}>{data.interpretation}</Text>}
            {data.recommendation&&(<View style={ss.rec}><Text style={ss.recLabel}>Recommendation</Text><Text style={ss.recText}>{data.recommendation}</Text></View>)}
            <Text style={ss.meta}>Source: {data.source} · {data.date}</Text>
          </Card>
        </>)}
      </ScrollView>
    </SafeAreaView>
  )
}
const ss = StyleSheet.create({
  safe:{flex:1,backgroundColor:COLORS.bg},content:{padding:16,gap:12},title:{fontSize:22,fontWeight:"800",color:COLORS.primaryDark},
  empty:{textAlign:"center",color:COLORS.textMuted,padding:20},mt:{},cardTitle:{fontSize:16,fontWeight:"700",color:COLORS.primaryDark,marginBottom:12},
  grid:{flexDirection:"row",gap:12,marginBottom:12},stat:{flex:1,alignItems:"center",backgroundColor:"#f0faf4",borderRadius:12,padding:12},statNum:{fontSize:28,fontWeight:"900",color:COLORS.primaryDark},statLabel:{fontSize:11,color:COLORS.textMuted,marginTop:2},
  health:{fontSize:15,fontWeight:"700",color:COLORS.primary,marginBottom:8},interp:{fontSize:13,color:"#4b5563",lineHeight:20},
  rec:{backgroundColor:"#fffbeb",borderRadius:10,padding:12,marginTop:8},recLabel:{fontSize:10,fontWeight:"700",color:"#92400e",textTransform:"uppercase",marginBottom:4},recText:{fontSize:13,color:"#92400e"},
  meta:{fontSize:11,color:COLORS.textMuted,marginTop:8},
})
