import React, { useEffect, useState } from "react"
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Picker } from '@react-native-picker/picker'
import indiaData from '../utils/india.json'
import { getOnboardingStatus, saveFarmProfile } from "../services/api"
import { Card, Spinner, COLORS, Button } from "../components/UI"
import { useLanguage } from "../contexts/LanguageContext"

const CROPS = ["Wheat","Rice","Maize","Cotton","Soybean","Tomato","Onion","Potato","Sugarcane","Mango","Banana","Other"]
const SOILS = ["Clay","Sandy","Loamy","Silt","Peat","Chalk","Loam"]

export default function FarmScreen() {
  const { t } = useLanguage()
  const [status, setStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ crop: "", soil_type: "Loamy", land_size_acres: "", location_lat: "", location_lon: "", state: "", district: "", sow_date: "", farmer_category: "small" })
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const states = indiaData.map(s => s.name)
  let districts: string[] = []
  try {
    if (form.state) {
      const stateObj = indiaData.find(s => s.name === form.state)
      if (stateObj) districts = stateObj.districts
    }
  } catch (e) {
    // ignore if state is somehow invalid
  }

  useEffect(() => {
    getOnboardingStatus().then((s) => {
      const farm = s?.farm
      if (farm) setForm((f) => ({ ...f, ...farm, land_size_acres: String(farm.land_size_acres || ""), location_lat: String(farm.location_lat || ""), location_lon: String(farm.location_lon || "") }))
      setStatus(s)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await saveFarmProfile({ ...form, land_size_acres: +form.land_size_acres, location_lat: +form.location_lat, location_lon: +form.location_lon })
      Alert.alert("Saved", "Farm profile updated successfully!")
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.detail || "Save failed.")
    } finally { setSaving(false) }
  }

  if (loading) return <SafeAreaView style={ss.safe}><Spinner /></SafeAreaView>
  return (
    <SafeAreaView style={ss.safe}>
      <ScrollView contentContainerStyle={ss.content}>
        <Text style={ss.title}>🌱 {t("nav.farm") || "My Farm"}</Text>
        {status?.completed && <Text style={ss.completedBadge}>✓ Farm setup complete ({status.completeness}%)</Text>}
        <Card style={ss.mt}>
          <Text style={ss.secTitle}>Basic Info</Text>
          {[{label:"State", key:"state"},{label:"District", key:"district"},{label:"Land Size (acres)", key:"land_size_acres", type:"numeric"},{label:"Sow Date (YYYY-MM-DD)", key:"sow_date"}].map(({label,key,type}) => (
            <View key={key} style={ss.field}>
              <Text style={ss.fieldLabel}>{label}</Text>
              {key === 'state' ? (
                <View style={ss.pickerWrap}>
                  <Picker selectedValue={form.state} onValueChange={(v) => { set('state', v); set('district', ''); }}>
                    <Picker.Item label="Select State" value="" color="#9ca3af" />
                    {states.map(s => <Picker.Item key={s} label={s} value={s} />)}
                  </Picker>
                </View>
              ) : key === 'district' ? (
                <View style={ss.pickerWrap}>
                  <Picker selectedValue={form.district} onValueChange={(v) => set('district', v)} enabled={!!form.state}>
                    <Picker.Item label="Select District" value="" color="#9ca3af" />
                    {districts.map(d => <Picker.Item key={d} label={d} value={d} />)}
                  </Picker>
                </View>
              ) : (
                <TextInput style={ss.input} value={(form as any)[key]} onChangeText={(v) => set(key, v)} keyboardType={(type as any) || "default"} placeholderTextColor="#9ca3af" placeholder={label} />
              )}
            </View>
          ))}
        </Card>
        <Card style={ss.mt}>
          <Text style={ss.secTitle}>Crop</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {CROPS.map((c) => (
              <TouchableOpacity key={c} onPress={() => set("crop", c)} style={[ss.chip, form.crop === c && ss.chipActive]}>
                <Text style={[ss.chipText, form.crop === c && ss.chipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Card>
        <Card style={ss.mt}>
          <Text style={ss.secTitle}>Soil Type</Text>
          <View style={ss.chipRow}>
            {SOILS.map((s) => (
              <TouchableOpacity key={s} onPress={() => set("soil_type", s)} style={[ss.chip, form.soil_type === s && ss.chipActive]}>
                <Text style={[ss.chipText, form.soil_type === s && ss.chipTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>
        <Card style={ss.mt}>
          <Text style={ss.secTitle}>Location (GPS)</Text>
          <View style={ss.row}>
            <View style={{flex:1}}><Text style={ss.fieldLabel}>Latitude</Text><TextInput style={ss.input} value={form.location_lat} onChangeText={(v) => set("location_lat",v)} keyboardType="numeric" placeholder="e.g. 22.7" placeholderTextColor="#9ca3af"/></View>
            <View style={{flex:1,marginLeft:8}}><Text style={ss.fieldLabel}>Longitude</Text><TextInput style={ss.input} value={form.location_lon} onChangeText={(v) => set("location_lon",v)} keyboardType="numeric" placeholder="e.g. 75.8" placeholderTextColor="#9ca3af"/></View>
          </View>
        </Card>
        <TouchableOpacity style={ss.saveBtn} onPress={save} disabled={saving}>
          <Text style={ss.saveBtnText}>{saving ? "Saving…" : "💾 Save Farm Profile"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}
const ss = StyleSheet.create({
  safe:{flex:1,backgroundColor:COLORS.bg},content:{padding:16,gap:12},title:{fontSize:22,fontWeight:"800",color:COLORS.primaryDark},
  completedBadge:{fontSize:13,color:COLORS.primary,fontWeight:"700"},mt:{marginTop:4},secTitle:{fontSize:15,fontWeight:"700",color:COLORS.primaryDark,marginBottom:12},
  field:{marginBottom:10},fieldLabel:{fontSize:12,fontWeight:"700",color:"#6b7280",marginBottom:4},
  input:{borderWidth:1.5,borderColor:COLORS.border,borderRadius:10,paddingHorizontal:12,paddingVertical:10,fontSize:14,color:COLORS.textPrimary,backgroundColor:"#f9fafb"},
  pickerWrap:{borderWidth:1.5,borderColor:COLORS.border,borderRadius:10,backgroundColor:"#f9fafb",overflow:'hidden'},
  chip:{paddingHorizontal:14,paddingVertical:8,borderRadius:20,borderWidth:1.5,borderColor:COLORS.border,backgroundColor:"#f9fafb",marginRight:8,marginBottom:8},
  chipActive:{backgroundColor:COLORS.primary,borderColor:COLORS.primary},chipText:{fontSize:13,fontWeight:"600",color:COLORS.textMuted},chipTextActive:{color:"#fff"},
  chipRow:{flexDirection:"row",flexWrap:"wrap"},row:{flexDirection:"row"},
  saveBtn:{backgroundColor:COLORS.primary,borderRadius:12,paddingVertical:14,alignItems:"center",marginTop:8,shadowColor:COLORS.primary,shadowOpacity:0.4,shadowOffset:{width:0,height:4},shadowRadius:8,elevation:4},
  saveBtnText:{color:"#fff",fontWeight:"800",fontSize:16},
})
