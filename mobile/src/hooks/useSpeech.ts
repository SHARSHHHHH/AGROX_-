// Speech language definitions for React Native
// The actual voice recognition is handled by expo-speech (TTS) and 
// @react-native-voice/voice (STT) — but we keep the same exported shape
// so all callers (LanguageContext, VoiceButton, etc.) compile unchanged.

export const SPEECH_LANGS: Record<string, { tag: string; label: string; native: string }> = {
  hi: { tag: 'hi-IN', label: 'Hindi', native: 'हिन्दी' },
  en: { tag: 'en-IN', label: 'English', native: 'English' },
  ta: { tag: 'ta-IN', label: 'Tamil', native: 'தமிழ்' },
}

export const SUPPORTED_UI_LANGS = ['hi', 'en', 'ta'] as const
export type SpeechLang = keyof typeof SPEECH_LANGS

export function useSpeech(lang: SpeechLang, callbacks?: {
  onFinal?: (text: string) => void
  onInterim?: (text: string) => void
}) {
  // Stub — voice input on RN needs @react-native-voice/voice native setup.
  // Returns same shape as the web hook so all callers compile.
  return {
    supported: false as boolean,
    listening: false as boolean,
    error: '' as string,
    interim: '' as string,
    toggle: () => {},
    stop: () => {},
  }
}
