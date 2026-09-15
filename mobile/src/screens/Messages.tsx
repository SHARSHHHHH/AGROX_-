import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, FlatList } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { api, getUser } from '../services/api'
import { getHarvestMessages, sendHarvestMessage } from '../services/api'
import { Card, Spinner, COLORS } from '../components/UI'
import { useLanguage } from '../contexts/LanguageContext'
import AsyncStorage from '@react-native-async-storage/async-storage'

export default function MessagesScreen() {
  const { t } = useLanguage()
  const [user, setUser] = useState<any>(null)
  const [harvests, setHarvests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    getUser().then(setUser)
  }, [])

  useEffect(() => {
    if (!user) return
    const fetchThreads = async () => {
      try {
        const token = await AsyncStorage.getItem('token')
        const isBuyer = user?.role === 'buyer'
        const endpoint = isBuyer ? '/api/harvest/prebooking/my' : '/api/harvest/calendar/my'
        const res = await api.get(endpoint)
        let data = res.data
        if (isBuyer) data = data.map((b: any) => b.harvest || { id: b.harvest_id, crop: `Harvest #${b.harvest_id}` })
        setHarvests(data)
      } catch { } finally { setLoading(false) }
    }
    fetchThreads()
  }, [user])

  const selectHarvest = async (id: number) => {
    setActiveId(id)
    setMessages(await getHarvestMessages(id))
  }

  const sendMsg = async () => {
    if (!activeId || !reply.trim() || sending) return
    setSending(true)
    try {
      const msg = await sendHarvestMessage(activeId, reply.trim())
      setMessages((c) => [...c, msg]); setReply('')
    } finally { setSending(false) }
  }

  if (loading) return <SafeAreaView style={ss.safe}><Spinner /></SafeAreaView>

  return (
    <SafeAreaView style={ss.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
        {activeId ? (
          <View style={{ flex: 1 }}>
            <View style={ss.chatHeader}>
              <TouchableOpacity onPress={() => setActiveId(null)} style={ss.backBtn}><Text style={ss.backText}>← Back</Text></TouchableOpacity>
              <Text style={ss.chatTitle}>{harvests.find((h) => h.id === activeId)?.crop || 'Chat'}</Text>
            </View>
            <FlatList
              data={messages}
              keyExtractor={(_, i) => String(i)}
              contentContainerStyle={ss.msgList}
              renderItem={({ item: m }) => (
                <View style={[ss.msgBubble, m.is_mine ? ss.myBubble : ss.theirBubble]}>
                  <Text style={ss.msgSender}>{m.sender_name}</Text>
                  <Text style={ss.msgText}>{m.content}</Text>
                </View>
              )}
            />
            <View style={ss.inputRow}>
              <TextInput style={ss.input} value={reply} onChangeText={setReply} placeholder="Write a message…" placeholderTextColor="#9ca3af" />
              <TouchableOpacity style={[ss.sendBtn, (!reply.trim() || sending) && ss.sendBtnDisabled]} onPress={sendMsg}>
                <Text style={ss.sendBtnText}>↑</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={ss.content}>
            <Text style={ss.title}>💬 {t('nav.messages') || 'Messages'}</Text>
            {harvests.length === 0 && <Card><Text style={ss.empty}>No active chats. Messages appear when someone contacts you about your harvest listings.</Text></Card>}
            {harvests.map((h) => (
              <TouchableOpacity key={h.id} onPress={() => selectHarvest(h.id)} style={ss.threadCard}>
                <Text style={ss.threadCrop}>{h.crop} {h.variety ? `(${h.variety})` : ''}</Text>
                <Text style={ss.threadStatus}>{h.status?.replace('_', ' ')?.toUpperCase() || ''}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const ss = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, gap: 10 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.primaryDark, marginBottom: 8 },
  empty: { textAlign: 'center', color: COLORS.textMuted, padding: 20 },
  threadCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 16, marginBottom: 8 },
  threadCrop: { fontSize: 16, fontWeight: '700', color: COLORS.primaryDark },
  threadStatus: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: COLORS.primaryDark },
  backBtn: {},
  backText: { color: 'rgba(255,255,255,0.8)', fontSize: 16 },
  chatTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  msgList: { padding: 16, gap: 8, paddingBottom: 8 },
  msgBubble: { borderRadius: 14, padding: 12, maxWidth: '80%' },
  myBubble: { alignSelf: 'flex-end', backgroundColor: COLORS.primary },
  theirBubble: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border },
  msgSender: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  msgText: { fontSize: 14, color: '#fff' },
  inputRow: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: COLORS.border },
  input: { flex: 1, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '900' },
})
