import React, { useEffect, useState, useRef } from 'react'
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { chatWithAdvisor } from '../services/api'
import { COLORS, Spinner } from '../components/UI'
import { useLanguage } from '../contexts/LanguageContext'

type Message = { role: 'user' | 'assistant'; content: string }

export default function AIAdvisorScreen() {
  const { language, t } = useLanguage()
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: '🌾 Namaste! I am your AI Farming Advisor. Ask me anything about crops, soil, water, weather, schemes, or your farm.' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const listRef = useRef<FlatList>(null)

  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg = { role: 'user' as const, content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages); setInput(''); setLoading(true)
    try {
      const res = await chatWithAdvisor(newMessages, { language })
      setMessages([...newMessages, { role: 'assistant', content: res.reply || res.answer || 'I could not get a response. Please try again.' }])
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: 'Connection error. Please check the backend is running.' }])
    } finally {
      setLoading(false)
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }

  const renderItem = ({ item }: { item: Message }) => (
    <View style={[ss.bubble, item.role === 'user' ? ss.userBubble : ss.aiBubble]}>
      <Text style={[ss.bubbleText, item.role === 'user' ? ss.userText : ss.aiText]}>
        {item.role === 'assistant' ? '🌾 ' : ''}{item.content}
      </Text>
    </View>
  )

  return (
    <SafeAreaView style={ss.safe}>
      <View style={ss.header}>
        <Text style={ss.headerEmoji}>🤖</Text>
        <View>
          <Text style={ss.headerTitle}>AI Farming Advisor</Text>
          <Text style={ss.headerSub}>Powered by your farm data</Text>
        </View>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
        <FlatList
          ref={listRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={ss.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        />
        {loading && (
          <View style={ss.loadingRow}>
            <Text style={ss.loadingDots}>🌾 Thinking…</Text>
          </View>
        )}
        <View style={ss.inputRow}>
          <TextInput
            style={ss.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about your crops, soil, weather…"
            placeholderTextColor="#9ca3af"
            multiline
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <TouchableOpacity style={[ss.sendBtn, (!input.trim() || loading) && ss.sendBtnDisabled]} onPress={send} disabled={!input.trim() || loading}>
            <Text style={ss.sendBtnText}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const ss = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fdf9' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: COLORS.primaryDark, paddingTop: 8 },
  headerEmoji: { fontSize: 32 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  list: { padding: 16, gap: 12, paddingBottom: 8 },
  bubble: { maxWidth: '85%', borderRadius: 18, padding: 12 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: COLORS.primary },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  userText: { color: '#fff' },
  aiText: { color: COLORS.textPrimary },
  loadingRow: { paddingHorizontal: 16, paddingBottom: 4 },
  loadingDots: { color: COLORS.textMuted, fontStyle: 'italic' },
  inputRow: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: COLORS.border },
  input: { flex: 1, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: COLORS.textPrimary, maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '900' },
})
