import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, RefreshControl, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getHarvestMessageNotifications, getHarvestMessages, markNotificationRead, sendHarvestMessage, deleteHarvestMessage } from '../services/api'
import { Card, Spinner, COLORS } from '../components/UI'
import { useLanguage } from '../contexts/LanguageContext'

export default function NotificationsScreen() {
  const { t } = useLanguage()
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeHarvestId, setActiveHarvestId] = useState<number | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)

  const load = async () => {
    try { setNotifications(await getHarvestMessageNotifications()) } catch {} finally { setLoading(false) }
  }
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t) }, [])

  const openNotif = async (n: any) => {
    if (!n.read) { await markNotificationRead(n.id).catch(() => {}); setNotifications((c) => c.map((i) => i.id === n.id ? { ...i, read: true } : i)) }
    setActiveHarvestId(n.harvest_id)
    setMessages(await getHarvestMessages(n.harvest_id))
  }

  const sendReply = async () => {
    if (!activeHarvestId || !reply.trim() || sending) return
    setSending(true)
    try {
      const msg = await sendHarvestMessage(activeHarvestId, reply.trim())
      setMessages((c) => [...c, msg]); setReply(''); await load()
    } finally { setSending(false) }
  }

  const delMsg = async (msgId: number) => {
    Alert.alert('Delete message?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deleteHarvestMessage(activeHarvestId!, msgId)
        setMessages((c) => c.filter((m) => m.id !== msgId))
      }},
    ])
  }

  if (loading) return <SafeAreaView style={ss.safe}><Spinner /></SafeAreaView>

  const unread = notifications.filter((n) => !n.read).length

  return (
    <SafeAreaView style={ss.safe}>
      <ScrollView contentContainerStyle={ss.content} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={COLORS.primary} />}>
        <Text style={ss.title}>🔔 {t('notifications.title') || 'Notifications'}</Text>
        {unread > 0 && <View style={ss.unreadBanner}><Text style={ss.unreadText}>{unread} unread message{unread > 1 ? 's' : ''}</Text></View>}

        {notifications.length === 0 && <Card><Text style={ss.empty}>No notifications yet</Text></Card>}

        {notifications.map((n) => (
          <TouchableOpacity key={n.id} onPress={() => openNotif(n)}
            style={[ss.notifCard, !n.read && ss.notifUnread]}>
            <View style={ss.notifHeader}>
              <Text style={ss.notifTitle}>{n.title}</Text>
              {!n.read && <View style={ss.newDot}><Text style={ss.newText}>NEW</Text></View>}
            </View>
            <Text style={ss.notifSub}>{n.sender_name || 'Portal user'} · {n.crop || 'Harvest'}</Text>
            <Text style={ss.notifMsg}>{n.message}</Text>
            <Text style={ss.notifTime}>{n.created_at ? new Date(n.created_at).toLocaleString() : ''}</Text>
          </TouchableOpacity>
        ))}

        {/* Thread */}
        {activeHarvestId && (
          <Card style={ss.threadCard}>
            <View style={ss.threadHeader}>
              <Text style={ss.threadTitle}>💬 Reply Thread</Text>
              <TouchableOpacity onPress={() => setActiveHarvestId(null)}><Text style={ss.closeBtn}>Close</Text></TouchableOpacity>
            </View>
            {messages.map((m) => (
              <View key={m.id} style={[ss.msgBubble, m.is_mine ? ss.myBubble : ss.theirBubble]}>
                <Text style={ss.msgSender}>{m.sender_name}</Text>
                <Text style={ss.msgContent}>{m.content}</Text>
                {m.is_mine && (
                  <TouchableOpacity onPress={() => delMsg(m.id)} style={ss.delBtn}><Text style={ss.delBtnText}>🗑</Text></TouchableOpacity>
                )}
              </View>
            ))}
            <View style={ss.replyRow}>
              <TextInput style={ss.replyInput} value={reply} onChangeText={setReply}
                placeholder={t('messages.writeReply') || 'Write a reply…'} placeholderTextColor="#9ca3af" />
              <TouchableOpacity style={[ss.sendBtn, (!reply.trim() || sending) && ss.sendBtnDisabled]} onPress={sendReply} disabled={!reply.trim() || sending}>
                <Text style={ss.sendBtnText}>↑</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const ss = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, gap: 10 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.primaryDark },
  unreadBanner: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fcd34d', borderRadius: 10, padding: 10 },
  unreadText: { color: '#92400e', fontWeight: '700' },
  empty: { textAlign: 'center', color: COLORS.textMuted, padding: 20 },
  notifCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14 },
  notifUnread: { backgroundColor: '#fffbeb', borderColor: '#fcd34d' },
  notifHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  notifTitle: { fontSize: 15, fontWeight: '700', color: COLORS.primaryDark, flex: 1 },
  newDot: { backgroundColor: '#f59e0b', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  newText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  notifSub: { fontSize: 12, color: COLORS.textMuted, marginBottom: 4 },
  notifMsg: { fontSize: 14, color: COLORS.textPrimary },
  notifTime: { fontSize: 11, color: COLORS.textMuted, marginTop: 4 },
  threadCard: { marginTop: 8 },
  threadHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  threadTitle: { fontWeight: '700', color: COLORS.primaryDark },
  closeBtn: { color: COLORS.textMuted, fontWeight: '600' },
  msgBubble: { borderRadius: 12, padding: 10, marginBottom: 8 },
  myBubble: { backgroundColor: '#dcfce7', alignSelf: 'flex-end', maxWidth: '80%' },
  theirBubble: { backgroundColor: '#f3f4f6', alignSelf: 'flex-start', maxWidth: '80%' },
  msgSender: { fontSize: 10, color: COLORS.textMuted, marginBottom: 2 },
  msgContent: { fontSize: 14, color: COLORS.textPrimary },
  delBtn: { alignSelf: 'flex-end', marginTop: 4 },
  delBtnText: { fontSize: 14 },
  replyRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  replyInput: { flex: 1, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '900' },
})
