import React, { ReactNode } from 'react'
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, ViewStyle, TextStyle,
} from 'react-native'

// ---- Colours ----
export const COLORS = {
  primary: '#2d6a4f',
  primaryLight: '#52b788',
  primaryDark: '#1b4332',
  accent: '#74c69d',
  bg: '#f6f8f6',
  card: '#ffffff',
  border: '#e8f0e8',
  textPrimary: '#1b4332',
  textSecondary: '#4a7c59',
  textMuted: '#6b7280',
  red: '#dc2626',
  amber: '#d97706',
  blue: '#2563eb',
  purple: '#7c3aed',
  success: '#16a34a',
}

// ---- StatusPill ----
const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'VERY LOW': { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  LOW: { bg: '#ffedd5', text: '#92400e', border: '#fed7aa' },
  OPTIMAL: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  HIGH: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  'VERY HIGH': { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd' },
  ACIDIC: { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  ALKALINE: { bg: '#e0e7ff', text: '#3730a3', border: '#a5b4fc' },
  CRITICAL: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  WARNING: { bg: '#ffedd5', text: '#92400e', border: '#fed7aa' },
  INFO: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  Good: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  Fair: { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  Poor: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
}

export function StatusPill({ status, colors }: {
  status: string
  colors?: Record<string, { bg: string; text: string; border: string }>
}) {
  const c = colors?.[status] || STATUS_COLORS[status] || { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' }
  return (
    <View style={[ss.pill, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={[ss.pillText, { color: c.text }]}>{status}</Text>
    </View>
  )
}

// ---- Card ----
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[ss.card, style]}>
      {children}
    </View>
  )
}

// ---- StatCard ----
export function StatCard({ label, value, unit, status, recommendation, icon }: {
  label: string; value: ReactNode; unit?: string; status?: string
  recommendation?: string; icon?: string
}) {
  return (
    <Card>
      <View style={ss.statRow}>
        <Text style={ss.statLabel}>{icon} {label}</Text>
        {status && <StatusPill status={status} />}
      </View>
      <View style={ss.statValueRow}>
        <Text style={ss.statValue}>{String(value)}</Text>
        {unit && <Text style={ss.statUnit}>{unit}</Text>}
      </View>
      {recommendation && <Text style={ss.statRec}>{recommendation}</Text>}
    </Card>
  )
}

// ---- Spinner ----
export function Spinner({ size = 'large' }: { size?: 'small' | 'large' }) {
  return (
    <View style={ss.spinnerWrap}>
      <ActivityIndicator size={size} color={COLORS.primary} />
    </View>
  )
}

// ---- Empty ----
export function Empty({ msg }: { msg: string }) {
  return (
    <View style={ss.emptyWrap}>
      <Text style={ss.emptyText}>{msg}</Text>
    </View>
  )
}

// ---- Button ----
type BtnVariant = 'primary' | 'ghost' | 'danger' | 'outline'

const BTN_STYLES: Record<BtnVariant, { bg: string; text: string; border: string }> = {
  primary: { bg: COLORS.primary, text: '#fff', border: COLORS.primary },
  ghost: { bg: '#f0faf4', text: COLORS.primary, border: '#f0faf4' },
  danger: { bg: '#ef4444', text: '#fff', border: '#ef4444' },
  outline: { bg: '#fff', text: '#374151', border: '#d1d5db' },
}

export function Button({
  children, onPress, variant = 'primary', disabled, style,
}: {
  children: ReactNode; onPress?: () => void; variant?: BtnVariant
  disabled?: boolean; style?: ViewStyle
}) {
  const v = BTN_STYLES[variant]
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[ss.btn, { backgroundColor: v.bg, borderColor: v.border, opacity: disabled ? 0.5 : 1 }, style]}
      activeOpacity={0.75}
    >
      {typeof children === 'string'
        ? <Text style={[ss.btnText, { color: v.text }]}>{children}</Text>
        : children}
    </TouchableOpacity>
  )
}

// ---- SectionHeader ----
export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={ss.sectionHeader}>
      <Text style={ss.sectionTitle}>{title}</Text>
      {subtitle && <Text style={ss.sectionSub}>{subtitle}</Text>}
    </View>
  )
}

// ---- Styles ----
const ss = StyleSheet.create({
  pill: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 999, borderWidth: 1,
  },
  pillText: { fontSize: 11, fontWeight: '700' },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16, borderWidth: 1, borderColor: COLORS.border,
    padding: 16, shadowColor: '#000', shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 2,
  },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  statLabel: { fontSize: 13, color: COLORS.textMuted, fontWeight: '500', flex: 1 },
  statValueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 8 },
  statValue: { fontSize: 36, fontWeight: '800', color: COLORS.primaryDark },
  statUnit: { fontSize: 16, color: COLORS.textMuted, marginLeft: 4 },
  statRec: { fontSize: 12, color: '#4b5563', marginTop: 8, lineHeight: 18 },
  spinnerWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 32 },
  emptyWrap: { paddingVertical: 32, alignItems: 'center' },
  emptyText: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center' },
  btn: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  btnText: { fontSize: 14, fontWeight: '700' },
  sectionHeader: { marginBottom: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: COLORS.primaryDark },
  sectionSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
})
