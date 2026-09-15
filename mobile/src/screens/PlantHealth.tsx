import React, { useEffect, useState, useRef } from 'react'
import { View, Text, Image, TextInput, ScrollView, StyleSheet, TouchableOpacity, Alert, Animated, Easing } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { LinearGradient } from 'expo-linear-gradient'
import { analyzePlant, getPlantHistory } from '../services/api'
import { Card, Spinner, StatusPill, COLORS } from '../components/UI'
import { useLanguage } from '../contexts/LanguageContext'

function toPoints(text?: string): string[] {
  if (!text) return []
  return text
    .replace(/([.!?])\s+(?=[A-Z0-9])/g, '$1\n')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
}

export default function PlantHealthScreen() {
  const { t, language } = useLanguage()
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [crop, setCrop] = useState('')
  const [result, setResult] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<any[]>([])

  const scanAnim = useRef(new Animated.Value(0)).current
  const fadeAnim = useRef(new Animated.Value(0)).current

  const loadHistory = () => getPlantHistory().then(setHistory).catch(() => {})
  useEffect(() => { loadHistory() }, [])

  // Scanner animation
  useEffect(() => {
    if (busy && imageUri) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanAnim, { toValue: 200, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(scanAnim, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
        ])
      ).start()
    } else {
      scanAnim.stopAnimation()
      scanAnim.setValue(0)
    }
  }, [busy, imageUri])

  // Result fade-in animation
  useEffect(() => {
    if (result) {
      fadeAnim.setValue(0)
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start()
    }
  }, [result])

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { Alert.alert('Permission needed', 'Please allow photo access.'); return }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
    if (!result.canceled && result.assets[0]) { setImageUri(result.assets[0].uri); setResult(null) }
  }

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) { Alert.alert('Permission needed', 'Please allow camera access.'); return }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 })
    if (!result.canceled && result.assets[0]) { setImageUri(result.assets[0].uri); setResult(null) }
  }

  const analyze = async () => {
    if (!imageUri) return
    setBusy(true); setResult(null)
    try {
      const res = await analyzePlant(imageUri, crop, language)
      setResult(res)
      loadHistory()
    } catch {
      setResult({ error: 'Analysis failed. Ensure backend is running and CROP_HEALTH_API_KEY is configured.' })
    } finally { setBusy(false) }
  }

  return (
    <SafeAreaView style={ss.safe}>
      <ScrollView contentContainerStyle={ss.content}>
        <View style={ss.headerRow}>
          <Text style={ss.title}>🍃 Plant Health</Text>
          <StatusPill status="OPTIMAL" label="AI Active" />
        </View>
        <Text style={ss.sub}>Upload a photo for AI disease/pest diagnosis</Text>

        {/* Image picker */}
        <Card style={[ss.mt, ss.noPaddingCard]}>
          <TouchableOpacity style={ss.photoArea} onPress={pickImage} activeOpacity={0.9}>
            {imageUri ? (
              <View style={ss.imageContainer}>
                <Image source={{ uri: imageUri }} style={ss.photo} resizeMode="cover" />
                {busy && <View style={ss.photoOverlay} />}
                {busy && (
                  <Animated.View style={[ss.scannerBar, { transform: [{ translateY: scanAnim }] }]} />
                )}
                {busy && (
                  <View style={ss.analyzingTag}>
                    <Spinner size="small" color="#fff" />
                    <Text style={ss.analyzingText}>AI is scanning crop...</Text>
                  </View>
                )}
              </View>
            ) : (
              <LinearGradient colors={['#f8fafc', '#f1f5f9']} style={ss.photoPlaceholder}>
                <View style={ss.iconCircle}>
                  <Text style={ss.photoEmoji}>📸</Text>
                </View>
                <Text style={ss.photoHint}>{t('plant.upload') || 'Tap to select photo'}</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
          
          <View style={ss.cardInner}>
            <View style={ss.photoButtons}>
              <TouchableOpacity style={ss.photoBtn} onPress={pickImage}>
                <Text style={ss.photoBtnText}>📁 Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity style={ss.photoBtn} onPress={takePhoto}>
                <Text style={ss.photoBtnText}>📷 Camera</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={ss.input}
              value={crop}
              onChangeText={setCrop}
              placeholder={t('plant.cropph') || 'Crop name (optional)'}
              placeholderTextColor="#9ca3af"
            />
            
            <TouchableOpacity onPress={analyze} disabled={!imageUri || busy} activeOpacity={0.8}>
              <LinearGradient 
                colors={(!imageUri || busy) ? ['#9ca3af', '#9ca3af'] : ['#2d6a4f', '#1b4332']} 
                style={ss.analyzeBtn}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              >
                <Text style={ss.analyzeBtnText}>{busy ? 'Processing...' : 'Analyze Crop Health'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Result */}
        {result && !result.error && (
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
            <Card style={ss.mt}>
              <View style={ss.resultHeader}>
                <Text style={ss.disease}>
                  {result.uncertain ? '⚠️ Uncertain' : result.issue_type === 'pest' ? `🐛 ${result.disease}` : `🍃 ${result.disease}`}
                </Text>
                {!result.uncertain && result.disease !== 'Healthy' && (
                  <StatusPill status={result.confidence >= 0.8 ? 'OPTIMAL' : 'WARNING'} />
                )}
              </View>
              {result.confidence > 0 && (
                <Text style={ss.conf}>Confidence: {(result.confidence * 100).toFixed(0)}%
                  {result.severity && result.severity !== 'unknown' ? ` · Severity: ${result.severity}` : ''}</Text>
              )}
              {toPoints(result.symptoms).length > 0 && (
                <View style={ss.section}>
                  <Text style={ss.secLabel}>SYMPTOMS</Text>
                  {toPoints(result.symptoms).map((p, i) => <Text key={i} style={ss.point}>• {p}</Text>)}
                </View>
              )}
              {result.recommendation && (
                <View style={ss.section}>
                  <Text style={ss.secLabel}>RECOMMENDATION</Text>
                  {toPoints(result.recommendation).map((p, i) => <Text key={i} style={ss.point}>• {p}</Text>)}
                </View>
              )}
              <Text style={ss.disclaimer}>AI-assisted. Confirm with an agricultural expert for critical decisions.</Text>
            </Card>
          </Animated.View>
        )}
        {result?.error && (
          <Animated.View style={{ opacity: fadeAnim }}>
            <Card style={ss.mt}><Text style={ss.errText}>{result.error}</Text></Card>
          </Animated.View>
        )}

        {/* History */}
        {history.length > 0 && (
          <View style={ss.mt}>
            <Text style={ss.histTitle}>{t('plant.recent') || 'Recent Diagnoses'}</Text>
            {history.slice(0, 5).map((h) => (
              <Card key={h.id} style={ss.histCard}>
                <Text style={ss.histDisease}>{h.disease}</Text>
                <Text style={ss.histMeta}>{h.crop || ''} · {new Date(h.date).toLocaleDateString()}</Text>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const ss = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, gap: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.primaryDark },
  sub: { fontSize: 14, color: COLORS.textMuted },
  mt: { marginTop: 4 },
  noPaddingCard: { padding: 0, overflow: 'hidden' },
  cardInner: { padding: 16 },
  photoArea: { width: '100%', borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: '#f8fafc' },
  imageContainer: { width: '100%', height: 220, position: 'relative', overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  photoOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
  scannerBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: '#10b981', shadowColor: '#10b981', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 10, elevation: 10 },
  analyzingTag: { position: 'absolute', bottom: 16, left: 16, right: 16, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 8, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  analyzingText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  photoPlaceholder: { height: 200, alignItems: 'center', justifyContent: 'center' },
  iconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, elevation: 2 },
  photoEmoji: { fontSize: 32 },
  photoHint: { color: COLORS.textPrimary, fontWeight: '600', fontSize: 15 },
  photoButtons: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  photoBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.02, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 1 },
  photoBtnText: { fontWeight: '700', color: COLORS.primaryDark },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: COLORS.textPrimary, backgroundColor: '#fff', marginBottom: 16 },
  analyzeBtn: { borderRadius: 12, paddingVertical: 16, alignItems: 'center', shadowColor: '#2d6a4f', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, elevation: 4 },
  analyzeBtnText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  disease: { fontSize: 20, fontWeight: '800', color: COLORS.primaryDark, flex: 1 },
  conf: { fontSize: 13, color: COLORS.textMuted, marginBottom: 12, fontWeight: '500' },
  section: { marginTop: 16 },
  secLabel: { fontSize: 11, fontWeight: '800', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  point: { fontSize: 14, color: '#374151', lineHeight: 22, marginBottom: 4 },
  disclaimer: { fontSize: 12, color: COLORS.textMuted, marginTop: 16, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12, fontStyle: 'italic' },
  errText: { color: COLORS.red, fontSize: 14, fontWeight: '600' },
  histTitle: { fontSize: 18, fontWeight: '800', color: COLORS.primaryDark, marginBottom: 12 },
  histCard: { marginBottom: 8, padding: 14, borderLeftWidth: 4, borderLeftColor: COLORS.primary },
  histDisease: { fontWeight: '700', color: COLORS.textPrimary, fontSize: 15 },
  histMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
})
