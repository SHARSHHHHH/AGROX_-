import React, { useEffect, useState } from "react"
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, RefreshControl } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { getMyListings, createListing, deleteListing } from "../services/api"
import { Card, Spinner, COLORS } from "../components/UI"
import { useLanguage } from "../contexts/LanguageContext"

export default function SellScreen() {
  const { t, tv } = useLanguage()
  const [listings, setListings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [form, setForm] = useState({ crop: "", quantity_kg: "", price_per_kg: "", contact_phone: "", maturity_date: "" })
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }))
  const load = async () => { try { setListings(await getMyListings()) } catch {} finally { setLoading(false); setRefreshing(false) } }
  useEffect(() => { load() }, [])
  const addListing = async () => {
    setAdding(true)
    try { 
      await createListing({ 
        crop: form.crop,
        intends_to_sell: true,
        quantity_kg: +form.quantity_kg, 
        price_per_kg: +form.price_per_kg,
        contact_phone: form.contact_phone,
        maturity_date: form.maturity_date || new Date().toISOString().split('T')[0]
      })
      setForm({ crop:"", quantity_kg:"", price_per_kg:"", contact_phone:"", maturity_date:"" })
      setShowForm(false)
      load() 
    }
    catch (e: any) { 
      const detail = e?.response?.data?.detail
      const msg = Array.isArray(detail) ? detail[0]?.msg : (detail || "Failed to create listing.")
      Alert.alert("Error", typeof msg === 'string' ? msg : JSON.stringify(msg))
    }
    finally { setAdding(false) }
  }
  const del = async (id: number) => {
    Alert.alert("Delete listing?","",[ {text:"Cancel",style:"cancel"},{text:"Delete",style:"destructive",onPress:async()=>{ await deleteListing(id); load() }}])
  }
  if (loading) return <SafeAreaView style={ss.safe}><Spinner /></SafeAreaView>
  return (
    <SafeAreaView style={ss.safe}>
      <ScrollView contentContainerStyle={ss.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load()}} tintColor={COLORS.primary}/>}>
        <View style={ss.header}>
          <Text style={ss.title}>🛒 {t("nav.sell")||"Sell Produce"}</Text>
          <TouchableOpacity onPress={()=>setShowForm(!showForm)} style={ss.addBtn}><Text style={ss.addBtnText}>+ Add</Text></TouchableOpacity>
        </View>
        {showForm && (
          <Card style={ss.mt}>
            <Text style={ss.secTitle}>New Listing</Text>
            {[{label:"Crop",key:"crop"},{label:"Quantity (kg)",key:"quantity_kg",num:true},{label:"Price/kg (₹)",key:"price_per_kg",num:true},{label:"Contact Phone",key:"contact_phone",num:true},{label:"Expected Harvest Date (YYYY-MM-DD)",key:"maturity_date"}].map(({label,key,num}) => (
              <TextInput key={key} style={ss.input} value={(form as any)[key]} onChangeText={(v)=>set(key,v)} placeholder={label} placeholderTextColor="#9ca3af" keyboardType={num?"numeric":"default"}/>
            ))}
            <TouchableOpacity style={ss.saveBtn} onPress={addListing} disabled={adding}><Text style={ss.saveBtnText}>{adding?"Creating…":"Create Listing"}</Text></TouchableOpacity>
          </Card>
        )}
        {listings.length===0&&<Card><Text style={ss.empty}>No listings yet. Create one to start selling!</Text></Card>}
        {listings.map((l)=>(<Card key={l.id} style={ss.listCard}>
          <View style={ss.listRow}><View style={{flex:1}}><Text style={ss.listCrop}>{tv(l.crop)}</Text><Text style={ss.listMeta}>{l.quantity_kg}kg · {l.district}</Text></View><Text style={ss.listPrice}>₹{l.price_per_kg}/kg</Text></View>
          <View style={[ss.statusBadge,{backgroundColor:l.status==="available"?"#dcfce7":"#f3f4f6"}]}><Text style={[ss.statusText,{color:l.status==="available"?COLORS.primary:"#6b7280"}]}>{l.status}</Text></View>
          <TouchableOpacity onPress={()=>del(l.id)} style={ss.delBtn}><Text style={ss.delBtnText}>Delete listing</Text></TouchableOpacity>
        </Card>))}
      </ScrollView>
    </SafeAreaView>
  )
}
const ss = StyleSheet.create({
  safe:{flex:1,backgroundColor:COLORS.bg},content:{padding:16,gap:10},header:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
  title:{fontSize:22,fontWeight:"800",color:COLORS.primaryDark},addBtn:{backgroundColor:COLORS.primary,borderRadius:10,paddingHorizontal:14,paddingVertical:8},addBtnText:{color:"#fff",fontWeight:"700"},
  mt:{marginTop:4},secTitle:{fontSize:15,fontWeight:"700",color:COLORS.primaryDark,marginBottom:10},
  input:{borderWidth:1.5,borderColor:COLORS.border,borderRadius:10,paddingHorizontal:12,paddingVertical:10,fontSize:14,color:COLORS.textPrimary,backgroundColor:"#f9fafb",marginBottom:8},
  saveBtn:{backgroundColor:COLORS.primary,borderRadius:10,paddingVertical:12,alignItems:"center"},saveBtnText:{color:"#fff",fontWeight:"800"},
  empty:{textAlign:"center",color:COLORS.textMuted,padding:20},listCard:{marginBottom:4},
  listRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8},listCrop:{fontSize:16,fontWeight:"700",color:COLORS.primaryDark},listMeta:{fontSize:12,color:COLORS.textMuted,marginTop:2},listPrice:{fontSize:18,fontWeight:"900",color:COLORS.primary},
  statusBadge:{paddingHorizontal:10,paddingVertical:4,borderRadius:999,alignSelf:"flex-start",marginBottom:8},statusText:{fontSize:12,fontWeight:"700"},
  delBtn:{alignSelf:"flex-start"},delBtnText:{fontSize:12,color:COLORS.red,fontWeight:"600"},
})
