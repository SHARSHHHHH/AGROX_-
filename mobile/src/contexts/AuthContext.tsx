import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { setLogoutRef } from '../services/api'

// ---- Auth Context (separate file to avoid circular dependency) ----
interface AuthCtx {
  user: any
  setUser: (u: any) => void
  loading: boolean
}

export const AuthContext = createContext<AuthCtx>({ user: null, setUser: () => {}, loading: true })
export const useAuth = () => useContext(AuthContext)

let _userCache: any = null
export const setUserCache = (u: any) => { _userCache = u }
export const getUserCache = () => _userCache

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLogoutRef(() => {
      setUserState(null)
      setUserCache(null)
    })

    AsyncStorage.getItem('user').then((raw) => {
      if (raw) {
        const u = JSON.parse(raw)
        setUserState(u)
        setUserCache(u)
      }
      setLoading(false)
    })
  }, [])

  const setUser = (u: any) => {
    setUserState(u)
    setUserCache(u)
    if (u) {
      AsyncStorage.setItem('user', JSON.stringify(u))
    } else {
      AsyncStorage.removeItem('user')
      AsyncStorage.removeItem('token')
    }
  }

  return <AuthContext.Provider value={{ user, setUser, loading }}>{children}</AuthContext.Provider>
}
