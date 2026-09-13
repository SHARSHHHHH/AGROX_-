import { StatusBar } from 'expo-status-bar'
import { LogBox } from 'react-native'
import { LanguageProvider } from './src/contexts/LanguageContext'
import { AuthProvider } from './src/contexts/AuthContext'
import AppNavigator from './src/navigation/AppNavigator'

// Suppress network error redboxes in demo mode when backend is offline
LogBox.ignoreLogs([
  'AxiosError: Network Error',
  'Uncaught (in promise',
])

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <AppNavigator />
      </AuthProvider>
    </LanguageProvider>
  )
}
