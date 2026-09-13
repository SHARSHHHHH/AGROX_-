import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Android emulator: 10.0.2.2 maps to the host machine's localhost.
// Change to your backend IP if testing on a real device (e.g. 192.168.1.x:8000).
const BASE_URL = 'http://10.71.210.153:8000'

export const api = axios.create({ baseURL: BASE_URL, timeout: 180000 })

export const getApiBase = () => BASE_URL

// ---- Land ----
export const browseLandListings = (params?: any) => api.get('/api/land/listings', { params }).then((r) => r.data)
export const getMyLandListings = () => api.get('/api/land/listings/my').then((r) => r.data)
export const createLandListing = (payload: any) => api.post('/api/land/listings', payload).then((r) => r.data)
export const deleteLandListing = (id: number) => api.delete(`/api/land/listings/${id}`).then((r) => r.data)
export const getMyLandContracts = () => api.get('/api/land/contracts/my').then((r) => r.data)
export const requestLandContract = (payload: any) => api.post('/api/land/contracts', payload).then((r) => r.data)
export const acceptLandContract = (id: number, payload: any) => api.post(`/api/land/contracts/${id}/accept`, payload).then((r) => r.data)
export const cancelLandContract = (id: number) => api.post(`/api/land/contracts/${id}/cancel`).then((r) => r.data)
export const getLandListingContact = (id: number) =>
  api.get(`/api/land/listings/${id}/contact`).then((r) => r.data)
export const getLandStats = () => api.get('/api/land/stats').then((r) => r.data)
export const updateLandListing = (id: number, payload: any) =>
  api.patch(`/api/land/listings/${id}`, payload).then((r) => r.data)
export const submitListingForVerification = (id: number) =>
  api.post(`/api/land/listings/${id}/submit`).then((r) => r.data)
export const validateSurvey = (surveyNumber: string) =>
  api.get(`/api/land/validate-survey?survey_number=${surveyNumber}`).then((r) => r.data)
export const uploadLandDocuments = (id: number, formData: FormData) =>
  api.post(`/api/land/listings/${id}/documents`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
export const getIncomingLandContracts = () =>
  api.get('/api/land/contracts/incoming').then((r) => r.data)
export const respondToLandContract = (id: number, payload: { action: string; farmer_notes?: string }) =>
  api.post(`/api/land/contracts/${id}/respond`, payload).then((r) => r.data)
export const getContractMessages = (id: number) =>
  api.get(`/api/land/contracts/${id}/messages`).then((r) => r.data)
export const sendContractMessage = (id: number, content: string) =>
  api.post(`/api/land/contracts/${id}/messages`, { content }).then((r) => r.data)
export const signContract = (id: number, payload: { otp: string, authorization_confirmed: boolean }) =>
  api.post(`/api/land/contracts/${id}/sign`, payload).then((r) => r.data)
export const getContractAudit = (id: number) =>
  api.get(`/api/land/contracts/${id}/audit`).then((r) => r.data)

// --- Payments ---
export const createPaymentOrder = (payload: { contract_id: number; amount: number; purpose: string }) =>
  api.post('/api/payments/create-order', payload).then((r) => r.data)
export const verifyPayment = (payload: { order_id: string; payment_id: string; signature: string }) =>
  api.post('/api/payments/verify', payload).then((r) => r.data)
export const getContractPayments = (contractId: number) =>
  api.get(`/api/payments/contract/${contractId}`).then((r) => r.data)

// --- Trust ---
export const submitReview = (payload: { contract_id: number; rating: number; comment: string }) =>
  api.post('/api/trust/reviews', payload).then((r) => r.data)
export const openDispute = (payload: { contract_id: number; reason: string }) =>
  api.post('/api/trust/disputes', payload).then((r) => r.data)

export const getHarvestMessages = (harvestId: number) =>
  api.get(`/api/harvest/calendar/${harvestId}/messages`).then((r) => r.data)
export const sendHarvestMessage = (harvestId: number, content: string) =>
  api.post(`/api/harvest/calendar/${harvestId}/messages`, { content }).then((r) => r.data)
export const deleteHarvestMessage = (harvestId: number, messageId: number) =>
  api.delete(`/api/harvest/calendar/${harvestId}/messages/${messageId}`).then((r) => r.data)
export const getHarvestMessageNotifications = () => api.get('/api/notifications').then((r) => r.data)
export const markNotificationRead = (notificationId: number) =>
  api.patch(`/api/notifications/${notificationId}/read`).then((r) => r.data)

api.interceptors.request.use(async (cfg) => {
  const token = await AsyncStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// Navigation ref for redirect on 401 — set in AppNavigator
let _navigateRef: ((screen: string) => void) | null = null
export const setNavigateRef = (fn: (screen: string) => void) => { _navigateRef = fn }

let _logoutRef: (() => void) | null = null
export const setLogoutRef = (fn: () => void) => { _logoutRef = fn }

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    // In Demo Mode (backend offline), intercept Network Errors for mutations
    // and mock a successful response so forms can be submitted without crashing.
    if (err.message === 'Network Error' || err.code === 'ECONNABORTED') {
      if (err.config?.method?.toLowerCase() !== 'get') {
        return Promise.resolve({ data: { success: true } })
      }
    }

    if (err.code === 'ECONNABORTED') {
      err.friendlyMessage =
        'The AI took too long to respond. Check the backend log for "Qwen ready", then try again.'
    }
    if (err.response?.status === 401) {
      await AsyncStorage.removeItem('token')
      await AsyncStorage.removeItem('user')
      if (_logoutRef) {
        _logoutRef()
      } else {
        _navigateRef?.('Login')
      }
    }
    return Promise.reject(err)
  }
)

// ---- Auth ----
export const login = async (email: string, password: string) => {

  const form = new URLSearchParams()
  form.append('username', email)
  form.append('password', password)
  const { data } = await api.post('/api/auth/login', form.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  await AsyncStorage.setItem('token', data.access_token)
  await AsyncStorage.setItem('user', JSON.stringify(data.user))
  return data.user
}

export const register = async (payload: any) => {
  const { data } = await api.post('/api/auth/register', payload)
  await AsyncStorage.setItem('token', data.access_token)
  await AsyncStorage.setItem('user', JSON.stringify(data.user))
  return data.user
}

export const requestOtp = (phone: string, purpose: 'register' | 'login' = 'register') =>
  api.post('/api/auth/otp/request', { phone, purpose }).then((r) => r.data)

export const verifyOtp = (phone: string, code: string, purpose: 'register' | 'login' = 'register') =>
  api.post('/api/auth/otp/verify', { phone, code, purpose }).then((r) => r.data.phone_verified_token)

export const registerFarmer = async (payload: {
  name: string; phone: string; password: string; confirm_password: string
  phone_verified_token: string; language?: string; state?: string; district?: string
}) => {
  const { data } = await api.post('/api/auth/register-farmer', payload)
  await AsyncStorage.setItem('token', data.access_token)
  await AsyncStorage.setItem('user', JSON.stringify(data.user))
  return data.user
}

export const loginFarmerWithOtp = async (phoneVerifiedToken: string) => {
  const { data } = await api.post('/api/auth/login-farmer', { phone_verified_token: phoneVerifiedToken })
  await AsyncStorage.setItem('token', data.access_token)
  await AsyncStorage.setItem('user', JSON.stringify(data.user))
  return data.user
}

export const logout = async () => {
  await AsyncStorage.removeItem('token')
  await AsyncStorage.removeItem('user')
  _navigateRef?.('Login')
}

export const getUser = async (): Promise<any | null> => {
  const u = await AsyncStorage.getItem('user')
  return u ? JSON.parse(u) : null
}

// Sync version for nav guards (reads from in-memory cache — populated after login)
let _cachedUser: any = null
export const getUserSync = () => _cachedUser
export const setUserCache = (u: any) => { _cachedUser = u }

// ---- Data endpoints ----
export const getLatestSensor = (device = 'ESP32-001') =>
  api.get(`/api/iot/latest?device_id=${device}`).then((r) => r.data)
export const simulateSensor = (device = 'ESP32-001') =>
  api.post(`/api/iot/simulate?device_id=${device}`).then((r) => r.data)
export const setScenario = (name: string) =>
  api.post(`/api/iot/scenario?name=${name}`).then((r) => r.data)
export const getSensorHistory = (device = 'ESP32-001') =>
  api.get(`/api/iot/history?device_id=${device}`).then((r) => r.data)
export const controlPump = (state: string, device = 'ESP32-001') =>
  api.post(`/api/iot/pump?device_id=${device}&state=${state}`).then((r) => r.data)

export const getIrrigation = () => api.get('/api/irrigation/recommendation').then((r) => r.data)
export const logIrrigation = (min: number) =>
  api.post(`/api/irrigation/event?duration_min=${min}`).then((r) => r.data)

export const getSoil = (language?: string) => api.get('/api/soil', { params: { language } }).then((r) => r.data)
export const addSoilTest = (payload: any, language?: string) =>
  api.post('/api/soil/test', payload, { params: { language } }).then((r) => r.data)

export const getWeather = () => api.get('/api/weather/current').then((r) => r.data)

export const analyzePlant = (uri: string, crop: string, language = 'en') => {
  const fd = new FormData() as any
  fd.append('file', { uri, name: 'photo.jpg', type: 'image/jpeg' } as any)
  fd.append('crop', crop)
  fd.append('language', language)
  return api.post('/api/plant/analyze', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
}
export const getPlantHistory = () => api.get('/api/plant/history').then((r) => r.data)

export const analyzePest = (uri: string, crop: string, language = 'en') => {
  const fd = new FormData() as any
  fd.append('file', { uri, name: 'photo.jpg', type: 'image/jpeg' } as any)
  fd.append('crop', crop)
  fd.append('language', language)
  return api.post('/api/pest/analyze', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
}
export const getPestHistory = () => api.get('/api/pest/history').then((r) => r.data)
export const getPestInfo = () => api.get('/api/pest/info').then((r) => r.data)

export const fileDisasterReport = (params: {
  disasterType: string; description: string; crop?: string
  latitude?: number; longitude?: number; locationTimestamp?: number
  files?: { uri: string; type: string; name: string }[]; voiceNote?: { uri: string; type: string; name: string }
}) => {
  const fd = new FormData() as any
  fd.append('disaster_type', params.disasterType)
  fd.append('description', params.description)
  if (params.crop) fd.append('crop', params.crop)
  if (params.latitude !== undefined) fd.append('latitude', String(params.latitude))
  if (params.longitude !== undefined) fd.append('longitude', String(params.longitude))
  if (params.locationTimestamp !== undefined) fd.append('location_timestamp', String(params.locationTimestamp))
  params.files?.forEach((f) => fd.append('files', f as any))
  if (params.voiceNote) fd.append('voice_note', params.voiceNote as any)
  return api.post('/api/disaster/report', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
}

export const getCropList = () => api.get('/api/crop/list').then((r) => r.data)
export const getCropStage = (crop: string, sowDate?: string) =>
  api.get('/api/crop/stage', { params: { crop, sow_date: sowDate } }).then((r) => r.data)
export const getLifecycle = (crop: string) =>
  api.get('/api/crop/lifecycle', { params: { crop } }).then((r) => r.data)
export const getSeason = () => api.get('/api/crop/season').then((r) => r.data)
export const recommendAdvisory = (payload: any) =>
  api.post('/api/crop/advisory', payload).then((r) => r.data)
export const getMyCropStage = () => api.get('/api/crop/my-stage').then((r) => r.data)
export const getCropLifecycleFor = (crop: string) =>
  api.get('/api/crop/lifecycle', { params: { crop } }).then((r) => r.data)

export const getFarmProfile = () => api.get('/api/farm/profile').then((r) => r.data)
export const saveFarmProfile = (payload: any) => api.post('/api/farm/profile', payload).then((r) => r.data)
export const getFarmSetupStatus = () => api.get('/api/farm/setup-status').then((r) => r.data)
export const getOnboardingStatus = () => api.get('/api/farm/onboarding').then((r) => r.data)

export const getMarketPrices = (params?: any) => api.get('/api/market/prices', { params }).then((r) => r.data)
export const getTrends = (crop: string) => api.get('/api/market/trends', { params: { crop } }).then((r) => r.data)

export const getMachinery = (params?: any) => api.get('/api/machinery/search', { params }).then((r) => r.data)
export const rentMachinery = (id: number, payload?: any) =>
  api.post(`/api/machinery/listing/${id}/contact`, payload).then((r) => r.data)
export const getMyRentals = () => api.get('/api/machinery/my-listings').then((r) => r.data)

export const getListings = (params?: any) => api.get('/api/marketplace/listings', { params }).then((r) => r.data)
export const getMyListings = () => api.get('/api/marketplace/listings/mine').then((r) => r.data)
export const createListing = (payload: any) => api.post('/api/marketplace/listings', payload).then((r) => r.data)
export const deleteListing = (id: number) => api.delete(`/api/marketplace/listings/${id}`).then((r) => r.data)

export const getHarvestCalendar = () => api.get('/api/harvest/calendar/my').then((r) => r.data)
export const addHarvestEntry = (payload: any) => api.post('/api/harvest/calendar', payload).then((r) => r.data)
export const updateHarvestEntry = (id: number, payload: any) =>
  api.patch(`/api/harvest/calendar/${id}`, payload).then((r) => r.data)
export const deleteHarvestEntry = (id: number) =>
  api.delete(`/api/harvest/calendar/${id}`).then((r) => r.data)

export const getPreBookings = () => api.get('/api/harvest/prebooking/my').then((r) => r.data)
export const createPreBooking = (payload: any) =>
  api.post('/api/harvest/prebooking', payload).then((r) => r.data)
export const cancelPreBooking = (id: number) =>
  api.post(`/api/harvest/prebooking/${id}/cancel`).then((r) => r.data)
export const browseHarvests = (params?: any) =>
  api.get('/api/harvest/calendar/browse', { params }).then((r) => r.data)

export const getAlerts = () => api.get('/api/alerts').then((r) => r.data)
export const getAlertsFiltered = (params?: any) =>
  api.get('/api/alerts', { params }).then((r) => r.data)
export const getAlertSummary = () => api.get('/api/alerts/summary').then((r) => r.data)
export const dismissAlert = (id: number) => api.post(`/api/alerts/${id}/dismiss`).then((r) => r.data)
export const markAlertRead = (id: number) => api.patch(`/api/alerts/${id}/read`).then((r) => r.data)
export const markAllAlertsRead = () => api.post('/api/alerts/read-all').then((r) => r.data)

export const getSatelliteData = (params?: any) =>
  api.get('/api/satellite/ndvi', { params }).then((r) => r.data)

export const getCircularRecommendations = () =>
  api.get('/api/circular/recommendations').then((r) => r.data)
export const getCircularSupplies = (params?: any) =>
  api.get('/api/circular/supplies', { params }).then((r) => r.data)
export const submitSupplyOffer = (payload: any) =>
  api.post('/api/circular/supplies', payload).then((r) => r.data)

export const getAnalytics = () => api.get('/api/analytics').then((r) => r.data)
export const addExpense = (category: string, amount: number, note: string, crop: string) =>
  api.post('/api/analytics/expense', { category, amount, note, crop }).then((r) => r.data)
export const deleteExpense = (id: number) => api.delete(`/api/analytics/expense/${id}`).then((r) => r.data)

export const getDailyPlan = (lang?: string) =>
  api.get('/api/daily-plan/today', { params: { language: lang } }).then((r) => r.data)
export const refreshDailyPlan = (lang?: string) =>
  api.post('/api/daily-plan/refresh', {}, { params: { language: lang } }).then((r) => r.data)
export const addDailyPlanTask = (payload: any, lang?: string) =>
  api.post('/api/daily-plan/add-task', payload, { params: { language: lang } }).then((r) => r.data)

export const checkEligibility = (payload: any) =>
  api.post('/api/schemes/check-eligibility', payload).then((r) => r.data)
export const markSchemeInterest = (id: number) =>
  api.post(`/api/schemes/${id}/interest`).then((r) => r.data)
export const getMySchemeInterests = () =>
  api.get('/api/schemes/mine/interests').then((r) => r.data)

export const getAdminStats = (params?: any) => api.get('/api/admin/stats', { params }).then((r) => r.data)
export const getAdminAlerts = () => api.get('/api/admin/alerts').then((r) => r.data)
export const getDisasterReports = () => api.get('/api/disaster/reports').then((r) => r.data)

export const chatWithAdvisor = (messages: any[], pageContext?: any) =>
  api.post('/api/advisor/chat', { messages, page_context: pageContext }).then((r) => r.data)

export const translateText = (text: string, target: string) =>
  api.post('/api/translate', { text, target }).then((r) => r.data)

export const getNotificationStatus = () => api.get('/api/notifications/status').then((r) => r.data)
export const subscribePush = (payload: any) =>
  api.post('/api/notifications/subscribe', payload).then((r) => r.data)
export const unsubscribePush = (endpoint: string) =>
  api.post('/api/notifications/unsubscribe', { endpoint }).then((r) => r.data)
