import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Text, View, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { setNavigateRef } from '../services/api'
import { COLORS } from '../components/UI'
import { useAuth } from '../contexts/AuthContext'

// ---- Screens ----
import LoginScreen from '../screens/Login'
import RegisterScreen from '../screens/Register'
import DashboardScreen from '../screens/Dashboard'
import FarmScreen from '../screens/Farm'
import WaterScreen from '../screens/Water'
import PlantHealthScreen from '../screens/PlantHealth'
import CropAdvisorScreen from '../screens/CropAdvisor'
import MachineryScreen from '../screens/Machinery'
import MarketScreen from '../screens/Market'
import AIAdvisorScreen from '../screens/AIAdvisor'
import SchemesScreen from '../screens/Schemes'
import AlertsScreen from '../screens/Alerts'
import AnalyticsScreen from '../screens/Analytics'
import SellScreen from '../screens/Sell'
import MarketplaceScreen from '../screens/Marketplace'
import HarvestCalendarScreen from '../screens/HarvestCalendar'
import PreBookingScreen from '../screens/PreBooking'
import NotificationsScreen from '../screens/Notifications'
import MessagesScreen from '../screens/Messages'
import DailyPlannerScreen from '../screens/DailyPlanner'
import FarmerLandScreen from '../screens/FarmerLand'
import LandContractorsScreen from '../screens/LandContractors'
import SettingsScreen from '../screens/Settings'
import AdminScreen from '../screens/Admin'
import SatelliteScreen from '../screens/Satellite'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()
const FarmerMoreStack = createNativeStackNavigator()
const BuyerMoreStack = createNativeStackNavigator()

// Auth is in AuthContext.tsx — imported above

// ---- Tab bar icon ----
function TabIcon({ emoji, label, focused }: { emoji: string; label: string; focused: boolean }) {
  return (
    <View style={[styles.tabItem, focused && styles.tabItemActive]}>
      <Text style={styles.tabEmoji}>{emoji}</Text>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
    </View>
  )
}

// ---- More stack (Farmer) ----
function FarmerMoreNavigator() {
  return (
    <FarmerMoreStack.Navigator screenOptions={{ headerStyle: { backgroundColor: COLORS.primaryDark }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' } }}>
      <FarmerMoreStack.Screen name="MoreMenu" component={FarmerMoreMenu} options={{ title: 'More' }} />
      <FarmerMoreStack.Screen name="Machinery" component={MachineryScreen} options={{ title: '🚜 Machinery' }} />
      <FarmerMoreStack.Screen name="Market" component={MarketScreen} options={{ title: '💰 Market Prices' }} />
      <FarmerMoreStack.Screen name="AIAdvisor" component={AIAdvisorScreen} options={{ title: '🤖 AI Advisor' }} />
      <FarmerMoreStack.Screen name="Schemes" component={SchemesScreen} options={{ title: '🏛️ Schemes' }} />
      <FarmerMoreStack.Screen name="Alerts" component={AlertsScreen} options={{ title: '🚨 Alerts' }} />
      <FarmerMoreStack.Screen name="Analytics" component={AnalyticsScreen} options={{ title: '📈 Analytics' }} />
      <FarmerMoreStack.Screen name="Sell" component={SellScreen} options={{ title: '🛒 Sell Produce' }} />
      <FarmerMoreStack.Screen name="HarvestCalendar" component={HarvestCalendarScreen} options={{ title: '📅 Harvest Calendar' }} />
      <FarmerMoreStack.Screen name="DailyPlanner" component={DailyPlannerScreen} options={{ title: '📋 Daily Planner' }} />
      <FarmerMoreStack.Screen name="FarmerLand" component={FarmerLandScreen} options={{ title: '🏡 My Land' }} />
      <FarmerMoreStack.Screen name="LandContractors" component={LandContractorsScreen} options={{ title: '📜 Land Contracts' }} />
      <FarmerMoreStack.Screen name="Satellite" component={SatelliteScreen} options={{ title: '🛰️ Satellite' }} />
      <FarmerMoreStack.Screen name="Settings" component={SettingsScreen} options={{ title: '⚙️ Settings' }} />
    </FarmerMoreStack.Navigator>
  )
}

import { ScrollView } from 'react-native'

const MORE_ITEMS = [
  { name: 'Machinery', emoji: '🚜', label: 'Machinery' },
  { name: 'Market', emoji: '💰', label: 'Market Prices' },
  { name: 'Schemes', emoji: '🏛️', label: 'Gov. Schemes' },
  { name: 'Alerts', emoji: '🚨', label: 'Alerts' },
  { name: 'Analytics', emoji: '📈', label: 'Analytics' },
  { name: 'Sell', emoji: '🛒', label: 'Sell Produce' },
  { name: 'HarvestCalendar', emoji: '📅', label: 'Harvest Calendar' },
  { name: 'DailyPlanner', emoji: '📋', label: 'Daily Planner' },
  { name: 'FarmerLand', emoji: '🏡', label: 'My Land' },
  { name: 'LandContractors', emoji: '📜', label: 'Land Contracts' },
  { name: 'Satellite', emoji: '🛰️', label: 'Satellite' },
  { name: 'AIAdvisor', emoji: '🤖', label: 'AI Advisor' },
  { name: 'Settings', emoji: '⚙️', label: 'Settings' },
]

function FarmerMoreMenu({ navigation }: any) {
  return (
    <ScrollView style={{ backgroundColor: COLORS.bg }} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.moreGrid}>
        {MORE_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.name}
            style={styles.moreCard}
            onPress={() => navigation.navigate(item.name)}
          >
            <Text style={styles.moreEmoji}>{item.emoji}</Text>
            <Text style={styles.moreLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  )
}

// ---- Farmer Tabs ----
function FarmerTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false, tabBarStyle: styles.tabBar, tabBarShowLabel: false }}
    >
      <Tab.Screen
        name="Dashboard" component={DashboardScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" label="Home" focused={focused} /> }}
      />
      <Tab.Screen
        name="Farm" component={FarmScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🌱" label="Farm" focused={focused} /> }}
      />
      <Tab.Screen
        name="Water" component={WaterScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="💧" label="Water" focused={focused} /> }}
      />
      <Tab.Screen
        name="PlantHealth" component={PlantHealthScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🍃" label="Health" focused={focused} /> }}
      />
      <Tab.Screen
        name="CropAdvisor" component={CropAdvisorScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🌾" label="Crops" focused={focused} /> }}
      />
      <Tab.Screen
        name="MoreTab" component={FarmerMoreNavigator}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="⋯" label="More" focused={focused} /> }}
      />
    </Tab.Navigator>
  )
}

// ---- Buyer Tabs ----
const BuyerMoreItems = [
  { name: 'PreBooking', emoji: '📅', label: 'Pre-Booking' },
  { name: 'LandContractors', emoji: '🏡', label: 'Land Contracts' },
  { name: 'Settings', emoji: '⚙️', label: 'Settings' },
]

function BuyerMoreMenu({ navigation }: any) {
  return (
    <ScrollView style={{ backgroundColor: COLORS.bg }} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.moreGrid}>
        {BuyerMoreItems.map((item) => (
          <TouchableOpacity key={item.name} style={styles.moreCard} onPress={() => navigation.navigate(item.name)}>
            <Text style={styles.moreEmoji}>{item.emoji}</Text>
            <Text style={styles.moreLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  )
}

function BuyerMoreNavigator() {
  return (
    <BuyerMoreStack.Navigator screenOptions={{ headerStyle: { backgroundColor: COLORS.primaryDark }, headerTintColor: '#fff' }}>
      <BuyerMoreStack.Screen name="MoreMenu" component={BuyerMoreMenu} options={{ title: 'More' }} />
      <BuyerMoreStack.Screen name="PreBooking" component={PreBookingScreen} options={{ title: '📅 Pre-Booking' }} />
      <BuyerMoreStack.Screen name="LandContractors" component={LandContractorsScreen} options={{ title: '🏡 Land Contracts' }} />
      <BuyerMoreStack.Screen name="Settings" component={SettingsScreen} options={{ title: '⚙️ Settings' }} />
    </BuyerMoreStack.Navigator>
  )
}

function BuyerTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false, tabBarStyle: styles.tabBar, tabBarShowLabel: false }}
    >
      <Tab.Screen name="Marketplace" component={MarketplaceScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🛒" label="Market" focused={focused} /> }} />
      <Tab.Screen name="Messages" component={MessagesScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="💬" label="Messages" focused={focused} /> }} />
      <Tab.Screen name="Notifications" component={NotificationsScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🔔" label="Alerts" focused={focused} /> }} />
      <Tab.Screen name="BuyerMore" component={BuyerMoreNavigator}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="⋯" label="More" focused={focused} /> }} />
    </Tab.Navigator>
  )
}

// ---- Admin stack ----
const AdminStack = createNativeStackNavigator()
function AdminNavigator() {
  return (
    <AdminStack.Navigator screenOptions={{ headerStyle: { backgroundColor: COLORS.primaryDark }, headerTintColor: '#fff' }}>
      <AdminStack.Screen name="Admin" component={AdminScreen} options={{ title: '🏛️ Admin Dashboard' }} />
    </AdminStack.Navigator>
  )
}

// ---- Root Navigator ----
export default function AppNavigator() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg }}>
        <Text style={{ fontSize: 40 }}>🌾</Text>
        <Text style={{ color: COLORS.primary, fontWeight: '700', marginTop: 8 }}>AGROX</Text>
      </View>
    )
  }

  return (
    <NavigationContainer
      ref={(nav: any) => {
        if (nav) {
          setNavigateRef((screen: string) => {
            nav.navigate(screen)
          })
        }
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : user.role === 'admin' ? (
          <Stack.Screen name="AdminRoot" component={AdminNavigator} />
        ) : user.role === 'buyer' ? (
          <Stack.Screen name="BuyerRoot" component={BuyerTabNavigator} />
        ) : (
          <Stack.Screen name="FarmerRoot" component={FarmerTabNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: COLORS.border,
    height: Platform.OS === 'ios' ? 85 : 65, paddingBottom: Platform.OS === 'ios' ? 20 : 8,
    paddingTop: 8,
    shadowColor: '#000', shadowOpacity: 0.08, shadowOffset: { width: 0, height: -2 }, shadowRadius: 8,
    elevation: 8,
  },
  tabItem: { alignItems: 'center', flex: 1, paddingVertical: 2 },
  tabItemActive: {},
  tabEmoji: { fontSize: 22 },
  tabLabel: { fontSize: 10, color: COLORS.textMuted, marginTop: 2, fontWeight: '500' },
  tabLabelActive: { color: COLORS.primary, fontWeight: '700' },
  moreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  moreCard: {
    width: '30%', backgroundColor: '#fff', borderRadius: 16, padding: 16,
    alignItems: 'center', borderWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4,
    elevation: 2,
  },
  moreEmoji: { fontSize: 28, marginBottom: 6 },
  moreLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textPrimary, textAlign: 'center' },
})
