import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SPEECH_LANGS, SpeechLang } from '../hooks/useSpeech'
import { Lang, translate, translateValue } from '../i18n/translations'

interface LanguageContextValue {
  language: SpeechLang
  setLanguage: (lang: SpeechLang) => void
  t: (key: string) => string
  tv: (value: string) => string
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: () => {},
  t: (k) => k,
  tv: (v) => v,
})

const STORAGE_KEY = 'agri_language'

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<SpeechLang>('hi')

  // Load saved language on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved && saved in SPEECH_LANGS) {
        setLanguageState(saved as SpeechLang)
      }
    })
    // Also check user record
    AsyncStorage.getItem('user').then((raw) => {
      if (!raw) return
      try {
        const user = JSON.parse(raw)
        AsyncStorage.getItem(STORAGE_KEY).then((savedLang) => {
          if (user?.language && user.language in SPEECH_LANGS && !savedLang) {
            setLanguageState(user.language as SpeechLang)
          }
        })
      } catch { /* ignore */ }
    })
  }, [])

  const setLanguage = (lang: SpeechLang) => {
    setLanguageState(lang)
    AsyncStorage.setItem(STORAGE_KEY, lang)
  }

  const t = (key: string): string => translate(language as Lang, key)
  const tv = (value: string): string => translateValue(language as Lang, value)

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, tv }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => useContext(LanguageContext)
