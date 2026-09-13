import React, { useEffect, useState } from "react"
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, RefreshControl, TextInput } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { getHarvestCalendar, addHarvestEntry, updateHarvestEntry, deleteHarvestEntry } from "../services/api"
import { Card, Spinner, COLORS } from "../components/UI"
import { useLanguage } from "../contexts/LanguageContext"

export default function HarvestCalendarScreen() {
  const { t, tv } = useLanguage()
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ crop:"", estimated_quantity_kg:"", expected_harvest_date:"", notes:"" })
  const set = (k:string,v:string) => setForm((f:any)=>({...f,[k]:v}))
  const load = async () => { try { setEntries(await getHarvestCalendar()) } catch {} finally { setLoading(false); setRefreshing(false) } }
  useEffect(() => { load() }, [])
  const add = async () => {
    try { await addHarvestEntry({...form,estimated_quantity_kg:+form.estimated_quantity_kg}); setShowForm(false); load() }
    catch(e:any){Alert.alert("Error",e?.response?.data?.detail)}
  }
  const del = async (id:number) => { Alert.alert("Delete?","",[ {text:"Cancel",style:"cancel"},{text:"Delete",style:"destructive",onPress:async()=>{await deleteHarvestEntry(id);load()}}]) }
  if (loading) return <SafeAreaView style={ss.safe}><Spinner /></SafeAreaView>
  return (
    <SafeAreaView style={ss.safe}>
      <ScrollView contentContainerStyle={ss.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load()}} tintColor={COLORS.primary}/>}>
        <View style={ss.hdr}>
          <Text style={ss.title}>📅 Harvest Calendar</Text>
          <TouchableOpacity onPress={()=>setShowForm(!showForm)} style={ss.addBtn}><Text style={ss.addBtnText}>+ Add</Text></TouchableOpacity>
        </View>
        {showForm&&(<Card style={ss.mt}>
          {[{label:"Crop",key:"crop"},{label:"Expected Yield (kg)",key:"estimated_quantity_kg",num:true},{label:"Harvest Date (YYYY-MM-DD)",key:"expected_harvest_date"},{label:"Notes",key:"notes"}].map(({label,key,num})=>(
            <TextInput key={key} style={ss.input} value={(form as any)[key]} onChangeText={(v)=>set(key,v)} placeholder={label} placeholderTextColor="#9ca3af" keyboardType={num?"numeric":"default"}/>
          ))}
          <TouchableOpacity style={ss.saveBtn} onPress={add}><Text style={ss.saveBtnText}>Add Entry</Text></TouchableOpacity>
        </Card>)}
        {entries.length===0&&<Card><Text style={ss.empty}>No harvest entries yet.</Text></Card>}
        {entries.map((e)=>(<Card key={e.id} style={ss.card}>
          <View style={ss.row}><Text style={ss.crop}>{tv(e.crop)}</Text><Text style={ss.date}>{e.expected_harvest_date ? e.expected_harvest_date.substring(0, 10) : 'N/A'}</Text></View>
          <Text style={ss.meta}>Yield: {e.estimated_quantity_kg}kg · Status: {e.status}</Text>
          {e.notes&&<Text style={ss.notes}>{e.notes}</Text>}
          <TouchableOpacity onPress={()=>del(e.id)}><Text style={ss.delText}>Delete</Text></TouchableOpacity>
        </Card>))}
      </ScrollView>
    </SafeAreaView>
  )
}
const ss = StyleSheet.create({
  safe:{flex:1,backgroundColor:COLORS.bg},content:{padding:16,gap:10},hdr:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
  title:{fontSize:22,fontWeight:"800",color:COLORS.primaryDark},addBtn:{backgroundColor:COLORS.primary,borderRadius:10,paddingHorizontal:14,paddingVertical:8},addBtnText:{color:"#fff",fontWeight:"700"},
  mt:{marginTop:4},input:{borderWidth:1.5,borderColor:COLORS.border,borderRadius:10,paddingHorizontal:12,paddingVertical:10,fontSize:14,color:COLORS.textPrimary,backgroundColor:"#f9fafb",marginBottom:8},
  saveBtn:{backgroundColor:COLORS.primary,borderRadius:10,paddingVertical:12,alignItems:"center"},saveBtnText:{color:"#fff",fontWeight:"800"},
  empty:{textAlign:"center",color:COLORS.textMuted,padding:20},card:{marginBottom:4},
  row:{flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start"},crop:{fontSize:16,fontWeight:"700",color:COLORS.primaryDark},date:{fontSize:13,color:COLORS.textMuted},
  meta:{fontSize:12,color:"#4b5563",marginTop:4},notes:{fontSize:12,color:"#6b7280",marginTop:4},delText:{color:COLORS.red,fontSize:12,fontWeight:"600",marginTop:8},
})
