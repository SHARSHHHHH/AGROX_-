import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getDailyPlan, refreshDailyPlan, addDailyPlanTask } from '../services/api'
import { Card, Spinner, COLORS } from '../components/UI'
import { useLanguage } from '../contexts/LanguageContext'

type Task = { time: string; task: string; priority: string; source: string; detail?: string }

const PRIORITY_STYLE: Record<string, { bg: string; text: string }> = {
  high: { bg: '#fee2e2', text: '#991b1b' },
  medium: { bg: '#fffbeb', text: '#92400e' },
  low: { bg: '#f0faf4', text: COLORS.primaryDark },
}

const SOURCE_ICON: Record<string, string> = {
  sensor: '📡', weather: '🌤️', satellite: '🛰️', soil: '🧪',
  market: '💰', lifecycle: '📅', general: '🌿',
}

const PERIOD_META: Record<string, { icon: string; label: string }> = {
  morning: { icon: '🌅', label: 'Morning' },
  afternoon: { icon: '☀️', label: 'Afternoon' },
  evening: { icon: '🌙', label: 'Evening' },
}

function getSummaryPoints(summary: string | undefined, tasks: Record<string, Task[]>): string[] {
  const lines = (summary || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
  if (lines.length >= 5) return lines.slice(0, 5)

  const sentences = (summary || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const taskPoints = Object.values(tasks).flat().map((task) => task.task).filter(Boolean)
  const combined = [...sentences, ...taskPoints]
  return combined.filter((point, i) => combined.indexOf(point) === i).slice(0, 5)
}

export default function DailyPlannerScreen() {
  const { language, t } = useLanguage()
  const [plan, setPlan] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newTask, setNewTask] = useState({ period: 'morning', time: '09:00 AM', task: '', priority: 'medium' })
  const [adding, setAdding] = useState(false)

  const load = () => {
    getDailyPlan(language).then(setPlan).catch(() => setPlan(null)).finally(() => { setLoading(false); setRefreshing(false) })
  }
  useEffect(load, [language])

  const doRefresh = async () => {
    setRefreshing(true)
    try { const p = await refreshDailyPlan(language); setPlan(p) } catch {}
    finally { setRefreshing(false) }
  }

  const doAddTask = async () => {
    if (!newTask.task) return Alert.alert('Error', 'Please enter a task description')
    setAdding(true)
    try {
      const p = await addDailyPlanTask(newTask, language)
      setPlan({ ...plan, tasks: p.tasks })
      setShowAdd(false)
      setNewTask({ period: 'morning', time: '09:00 AM', task: '', priority: 'medium' })
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to add task')
    } finally {
      setAdding(false)
    }
  }

  if (loading) return <SafeAreaView style={ss.safe}><Spinner /></SafeAreaView>

  const tasks = plan?.tasks || {}
  const hasTasks = Object.values(tasks).some((arr: any) => arr?.length > 0)

  return (
    <SafeAreaView style={ss.safe}>
      <ScrollView contentContainerStyle={ss.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={doRefresh} tintColor={COLORS.primary} />}>
        <View style={ss.header}>
          <View>
            <Text style={ss.title}>📋 {t('nav.dailyPlanner') || 'Daily Planner'}</Text>
            {plan?.generated_at && (
              <Text style={ss.sub}>Generated at {new Date(plan.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={() => setShowAdd(!showAdd)} style={ss.refreshBtn}>
              <Text style={ss.refreshBtnText}>+ Add</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={doRefresh} style={ss.refreshBtn}>
              <Text style={ss.refreshBtnText}>↻ Refresh</Text>
            </TouchableOpacity>
          </View>
        </View>

        {showAdd && (
          <Card style={{ backgroundColor: '#fff', borderColor: COLORS.border, marginBottom: 4 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.primaryDark, marginBottom: 10 }}>Add Custom Task</Text>
            
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              {['morning', 'afternoon', 'evening'].map(p => (
                <TouchableOpacity key={p} onPress={() => setNewTask({...newTask, period: p})} style={{ flex: 1, padding: 8, borderRadius: 8, backgroundColor: newTask.period === p ? COLORS.primary : '#f3f4f6', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: newTask.period === p ? '#fff' : COLORS.textPrimary, textTransform: 'capitalize' }}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput style={ss.input} placeholder="Time (e.g. 09:00 AM)" value={newTask.time} onChangeText={t => setNewTask({...newTask, time: t})} placeholderTextColor="#9ca3af" />
            <TextInput style={ss.input} placeholder="Task description..." value={newTask.task} onChangeText={t => setNewTask({...newTask, task: t})} placeholderTextColor="#9ca3af" />
            
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {['high', 'medium', 'low'].map(p => (
                <TouchableOpacity key={p} onPress={() => setNewTask({...newTask, priority: p})} style={{ flex: 1, padding: 8, borderRadius: 8, backgroundColor: newTask.priority === p ? PRIORITY_STYLE[p].bg : '#f3f4f6', borderWidth: newTask.priority === p ? 1 : 0, borderColor: PRIORITY_STYLE[p].text, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: newTask.priority === p ? PRIORITY_STYLE[p].text : COLORS.textPrimary, textTransform: 'uppercase' }}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity onPress={doAddTask} disabled={adding} style={{ backgroundColor: COLORS.primary, padding: 12, borderRadius: 8, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{adding ? 'Adding...' : 'Save Task'}</Text>
            </TouchableOpacity>
          </Card>
        )}

        {plan?.summary && (
          <Card style={ss.summaryCard}>
            <Text style={ss.summaryTitle}>📋 {t('nav.dailyPlanner') || 'Daily Plan'}</Text>
            {getSummaryPoints(plan.summary, tasks).map((point, idx) => (
              <View key={idx} style={ss.summaryPoint}>
                <View style={ss.summaryNumber}><Text style={ss.summaryNumberText}>{idx + 1}</Text></View>
                <Text style={ss.summaryText}>{point}</Text>
              </View>
            ))}
          </Card>
        )}

        {!hasTasks && (
          <Card><Text style={ss.empty}>No tasks planned for today. Check back after setup!</Text></Card>
        )}

        {['morning', 'afternoon', 'evening'].map((period) => {
          const periodTasks: Task[] = tasks[period] || []
          if (!periodTasks.length) return null
          const meta = PERIOD_META[period]
          return (
            <View key={period}>
              <Text style={ss.periodHeader}>{meta.icon} {meta.label} ({periodTasks.length})</Text>
              {periodTasks.map((task, idx) => (
                <Card key={idx} style={ss.taskCard}>
                  <View style={ss.taskRow}>
                    <Text style={ss.taskTime}>{task.time}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={ss.taskText}>{task.task}</Text>
                      {task.detail && <Text style={ss.taskDetail}>{task.detail}</Text>}
                      <View style={ss.taskMeta}>
                        <View style={[ss.priorityBadge, { backgroundColor: PRIORITY_STYLE[task.priority]?.bg || '#f3f4f6' }]}>
                          <Text style={[ss.priorityText, { color: PRIORITY_STYLE[task.priority]?.text || '#374151' }]}>
                            {task.priority}
                          </Text>
                        </View>
                        <Text style={ss.sourceText}>{SOURCE_ICON[task.source] || '📊'} {task.source}</Text>
                      </View>
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          )
        })}

        <Text style={ss.footer}>{t('dailyplanner.footer') || 'AI-generated. Review with local context.'}</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const ss = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, gap: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.primaryDark },
  sub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  refreshBtn: { backgroundColor: '#f0faf4', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.border },
  refreshBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  summaryCard: { backgroundColor: '#f0faf4', borderColor: COLORS.primaryLight },
  summaryTitle: { fontSize: 14, fontWeight: '800', color: COLORS.primaryDark, marginBottom: 8 },
  summaryPoint: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  summaryNumber: { width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.primaryDark, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  summaryNumberText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  summaryText: { flex: 1, fontSize: 13, color: COLORS.primaryDark, lineHeight: 20 },
  empty: { textAlign: 'center', color: COLORS.textMuted, padding: 20 },
  periodHeader: { fontSize: 15, fontWeight: '800', color: COLORS.primaryDark, marginTop: 8, marginBottom: 6 },
  taskCard: { marginBottom: 6 },
  taskRow: { flexDirection: 'row', gap: 10 },
  taskTime: { fontSize: 11, fontFamily: 'monospace', color: COLORS.textMuted, width: 36, marginTop: 2 },
  taskText: { fontSize: 14, color: COLORS.primaryDark, lineHeight: 20 },
  taskDetail: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  priorityText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  sourceText: { fontSize: 10, color: COLORS.textMuted },
  footer: { textAlign: 'center', fontSize: 10, color: COLORS.textMuted, marginTop: 8 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 14, backgroundColor: '#f9fafb', color: COLORS.textPrimary },
})
