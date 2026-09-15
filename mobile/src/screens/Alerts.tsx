import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getAlertsFiltered, getAlertSummary, dismissAlert, markAlertRead, markAllAlertsRead } from '../services/api'
import { Card, Spinner, COLORS, Button } from '../components/UI'
import { useLanguage } from '../contexts/LanguageContext'
import { useNavigation } from '@react-navigation/native'

const PRIORITY_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
  CRITICAL: { bg: '#fef2f2', border: '#fca5a5', dot: '#dc2626' },
  HIGH: { bg: '#fffbeb', border: '#fcd34d', dot: '#f59e0b' },
  MEDIUM: { bg: '#eff6ff', border: '#93c5fd', dot: '#3b82f6' },
  LOW: { bg: '#fff', border: '#e5e7eb', dot: '#9ca3af' },
}

const CATEGORY_ICON: Record<string, string> = {
  irrigation: '💧', water_tank: '🪣', weather: '🌦️', pest_nearby: '🐛',
  scheme: '🏛️', disaster: '🚨', compensation: '💰', supplies: '🧪',
  machinery: '🚜', lifecycle: '🌱', satellite: '🛰️', soil: '🧱', general: '🔔',
}

export default function AlertsScreen() {
  const { t } = useLanguage()
  const [alerts, setAlerts] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)

  const load = async () => {
    try {
      const [a, s] = await Promise.all([getAlertsFiltered().catch(() => []), getAlertSummary().catch(() => null)])
      setAlerts(a || []); setSummary(s)
    } finally { setLoading(false); setRefreshing(false) }
  }
  useEffect(() => { load() }, [])

  const dismiss = async (id: number) => {
    await dismissAlert(id); setAlerts((prev) => prev.filter((a) => a.id !== id))
  }

  const markRead = async (id: number) => {
    await markAlertRead(id); setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, read: true } : a))
  }

  if (loading) return <SafeAreaView style={ss.safe}><Spinner /></SafeAreaView>

  const sortedAlerts = [...alerts].sort((a, b) => {
    const order: any = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
    return (order[a.priority] ?? 4) - (order[b.priority] ?? 4)
  })

  return (
    <SafeAreaView style={ss.safe}>
      <ScrollView contentContainerStyle={ss.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={COLORS.primary} />}>
        <View style={ss.header}>
          <Text style={ss.title}>🚨 {t('nav.alerts') || 'Alerts'}</Text>
          {alerts.some((a) => !a.read) && (
            <TouchableOpacity onPress={() => markAllAlertsRead().then(load)}>
              <Text style={ss.markAllBtn}>Mark all read</Text>
            </TouchableOpacity>
          )}
        </View>

        {summary && (
          <View style={ss.summaryRow}>
            {[['CRITICAL', summary.critical || 0], ['HIGH', summary.high || 0], ['MEDIUM', summary.medium || 0]].map(([p, c]) => (
              <View key={p} style={[ss.summaryBadge, { backgroundColor: PRIORITY_COLORS[p]?.bg || '#f9fafb', borderColor: PRIORITY_COLORS[p]?.border || '#e5e7eb' }]}>
                <Text style={ss.summaryCount}>{c}</Text>
                <Text style={ss.summaryLabel}>{p}</Text>
              </View>
            ))}
          </View>
        )}

        {sortedAlerts.length === 0 && <Card><Text style={ss.empty}>No active alerts. Your farm is looking good! 🌱</Text></Card>}

        {sortedAlerts.map((a) => {
          const colors = PRIORITY_COLORS[a.priority] || PRIORITY_COLORS.LOW
          return (
            <TouchableOpacity key={a.id} onPress={() => { setExpanded(expanded === a.id ? null : a.id); markRead(a.id) }}
              style={[ss.alertCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <View style={ss.alertHeader}>
                <View style={[ss.dot, { backgroundColor: colors.dot }]} />
                <Text style={ss.alertCategory}>{CATEGORY_ICON[a.category] || '🔔'}</Text>
                <Text style={[ss.alertTitle, !a.read && ss.alertTitleUnread]}>{a.title || a.message?.slice(0, 60)}</Text>
                {!a.read && <View style={ss.unreadDot} />}
              </View>
              {expanded === a.id && (
                <View style={ss.alertBody}>
                  <Text style={ss.alertMsg}>{a.message}</Text>
                  <Text style={ss.alertTime}>{a.created_at ? new Date(a.created_at).toLocaleString() : ''}</Text>
                  <TouchableOpacity onPress={() => dismiss(a.id)} style={ss.dismissBtn}>
                    <Text style={ss.dismissBtnText}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              )}
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </SafeAreaView>
  )
}

const ss = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, gap: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.primaryDark },
  markAllBtn: { color: COLORS.primary, fontWeight: '600', fontSize: 13 },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  summaryBadge: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 12, borderWidth: 1.5 },
  summaryCount: { fontSize: 22, fontWeight: '900', color: COLORS.primaryDark },
  summaryLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase' },
  empty: { textAlign: 'center', color: COLORS.textMuted, padding: 20 },
  alertCard: { borderRadius: 14, borderWidth: 1.5, overflow: 'hidden' },
  alertHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  alertCategory: { fontSize: 18 },
  alertTitle: { flex: 1, fontSize: 13, color: COLORS.textPrimary },
  alertTitleUnread: { fontWeight: '700' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.red },
  alertBody: { paddingHorizontal: 12, paddingBottom: 12 },
  alertMsg: { fontSize: 13, color: '#374151', lineHeight: 20 },
  alertTime: { fontSize: 11, color: COLORS.textMuted, marginTop: 6 },
  dismissBtn: { marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#ef4444' },
  dismissBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
})
