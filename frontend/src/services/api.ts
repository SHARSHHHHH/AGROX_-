import axios from 'axios'

// A local CPU model can take 30-60s per answer, far beyond a typical default,
// so the timeout is generous. It is not infinite: without one, a stalled
// backend leaves the UI spinning forever with no way to recover.
export const api = axios.create({ baseURL: '', timeout: 180000 })

/** Base URL for constructing direct file links (contract PDFs, land photos,
 * uploaded documents) that are fetched with a plain <a>/<img> tag instead of
 * through the `api` axios instance above. Left relative ('') so it goes
 * through Vite's dev proxy (see vite.config.ts, which proxies both /api and
 * /uploads to the backend) — the same way `api` itself works. */
export const getApiBase = () => ''

export const browseLandListings = (params: Record<string, any> = {}) =>
  api.get('/api/land/browse', { params }).then((r) => r.data)
export const getLandListingContact = (id: number) =>
  api.get(`/api/land/listings/${id}/contact`).then((r) => r.data)
export const requestLandContract = (payload: any) =>
  api.post('/api/land/contracts', payload).then((r) => r.data)
export const getMyLandContracts = () =>
  api.get('/api/land/my-contracts').then((r) => r.data)
export const cancelLandContract = (id: number) =>
  api.post(`/api/land/contracts/${id}/cancel`).then((r) => r.data)
export const getLandStats = () => api.get('/api/land/stats').then((r) => r.data)
export const createLandListing = (payload: any) =>
  api.post('/api/land/listings', payload).then((r) => r.data)
export const updateLandListing = (id: number, payload: any) =>
  api.patch(`/api/land/listings/${id}`, payload).then((r) => r.data)
export const submitListingForVerification = (id: number) =>
  api.post(`/api/land/listings/${id}/submit`).then((r) => r.data)
export const validateSurvey = (surveyNumber: string) =>
  api.get(`/api/land/validate-survey?survey_number=${surveyNumber}`).then((r) => r.data)
export const uploadLandDocuments = (id: number, formData: FormData) =>
  api.post(`/api/land/listings/${id}/documents`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
export const getMyLandListings = () =>
  api.get('/api/land/my-listings').then((r) => r.data)
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

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.code === 'ECONNABORTED') {
      err.friendlyMessage =
        'The AI took too long to respond. If you are running the local Qwen ' +
        'model on CPU this is normal on the first request while it loads. ' +
        'Check the backend log for "Qwen ready", then try again.'
    }
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      if (!location.pathname.includes('login')) location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ---- Auth ----
export const login = async (email: string, password: string) => {
  const form = new URLSearchParams()
  form.append('username', email)
  form.append('password', password)
  const { data } = await api.post('/api/auth/login', form)
  localStorage.setItem('token', data.access_token)
  localStorage.setItem('user', JSON.stringify(data.user))
  return data.user
}

export const register = async (payload: any) => {
  const { data } = await api.post('/api/auth/register', payload)
  localStorage.setItem('token', data.access_token)
  localStorage.setItem('user', JSON.stringify(data.user))
  return data.user
}

// ---- Farmer phone + OTP registration/login ----
export const requestOtp = (phone: string, purpose: 'register' | 'login' = 'register') =>
  api.post('/api/auth/otp/request', { phone, purpose }).then((r) => r.data)

export const verifyOtp = (phone: string, code: string, purpose: 'register' | 'login' = 'register') =>
  api.post('/api/auth/otp/verify', { phone, code, purpose }).then((r) => r.data.phone_verified_token)

export const registerFarmer = async (payload: {
  name: string; phone: string; password: string; confirm_password: string
  phone_verified_token: string; language?: string; state?: string; district?: string
}) => {
  const { data } = await api.post('/api/auth/register-farmer', payload)
  localStorage.setItem('token', data.access_token)
  localStorage.setItem('user', JSON.stringify(data.user))
  return data.user
}

export const loginFarmerWithOtp = async (phoneVerifiedToken: string) => {
  const { data } = await api.post('/api/auth/login-farmer', { phone_verified_token: phoneVerifiedToken })
  localStorage.setItem('token', data.access_token)
  localStorage.setItem('user', JSON.stringify(data.user))
  return data.user
}

export const logout = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  location.href = '/login'
}

export const getUser = () => {
  const u = localStorage.getItem('user')
  return u ? JSON.parse(u) : null
}

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
export const addSoilTest = (payload: any, language?: string) => api.post('/api/soil/test', payload, { params: { language } }).then((r) => r.data)

export const getWeather = () => api.get('/api/weather/current').then((r) => r.data)

export const analyzePlant = (file: File, crop: string, language = 'en') => {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('crop', crop)
  fd.append('language', language)
  return api.post('/api/plant/analyze', fd).then((r) => r.data)
}
export const getPlantHistory = () => api.get('/api/plant/history').then((r) => r.data)

// ---- Pest management ----
export const analyzePest = (file: File, crop: string, language = 'en') => {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('crop', crop)
  fd.append('language', language)
  return api.post('/api/pest/analyze', fd).then((r) => r.data)
}
export const getPestHistory = () => api.get('/api/pest/history').then((r) => r.data)
export const getPestInfo = () => api.get('/api/pest/info').then((r) => r.data)

// ---- Disaster / emergency reports ----
// Re-uses the existing pest/disease vision pipeline server-side on the
// first file when disasterType is 'pest' or 'disease'.
export const fileDisasterReport = (params: {
  disasterType: string; description: string; crop?: string
  latitude?: number; longitude?: number; locationTimestamp?: number
  files?: File[]; voiceNote?: Blob | File
}) => {
  const fd = new FormData()
  fd.append('disaster_type', params.disasterType)
  fd.append('description', params.description)
  if (params.crop) fd.append('crop', params.crop)
  if (params.latitude != null) fd.append('latitude', String(params.latitude))
  if (params.longitude != null) fd.append('longitude', String(params.longitude))
  if (params.locationTimestamp != null) fd.append('location_timestamp', String(params.locationTimestamp))
  for (const f of params.files || []) fd.append('files', f)
  if (params.voiceNote) fd.append('voice_note', params.voiceNote, 'voice-note.webm')
  return api.post('/api/disaster/report', fd).then((r) => r.data)
}
export const getMyDisasterReports = () => api.get('/api/disaster/my-reports').then((r) => r.data)
export const getReliefChannels = (disasterType?: string) =>
  api.get('/api/disaster/relief-channels', { params: disasterType ? { disaster_type: disasterType } : {} })
    .then((r) => r.data)

// ---- Daily Plan ----
export const getDailyPlan = (language?: string) =>
  api.get('/api/daily-plan/today', { params: { language } }).then((r) => r.data)
export const refreshDailyPlan = (language?: string) =>
  api.post('/api/daily-plan/refresh', null, { params: { language } }).then((r) => r.data)
export const getDailyPlanHistory = (days: number = 7) =>
  api.get('/api/daily-plan/history', { params: { days } }).then((r) => r.data)

export const getSchemes = () => api.get('/api/schemes').then((r) => r.data)
export const getRecommendedSchemes = () => api.get('/api/schemes/recommended').then((r) => r.data)
export const checkEligibility = (payload: any) =>
  api.post('/api/schemes/check-eligibility', payload).then((r) => r.data)

export const chat = (message: string, language?: string, page_context?: string) =>
  api.post('/api/ai/chat', { message, language, page_context: page_context || '' }).then((r) => r.data)
export const transcribeVoice = (blob: Blob) => {
  const fd = new FormData()
  fd.append('file', blob, 'voice.webm')
  return api.post('/api/voice/transcribe', fd).then((r) => r.data)
}

export const getAlerts = () => api.get('/api/alerts').then((r) => r.data)
export const markAlertRead = (id: number) => api.post(`/api/alerts/${id}/read`).then((r) => r.data)
export const getAnalytics = () => api.get('/api/analytics').then((r) => r.data)

export const getFarms = () => api.get('/api/farms').then((r) => r.data)
export const createFarm = (payload: any) => api.post('/api/farms', payload).then((r) => r.data)
export const updateFarm = (id: number, payload: any) =>
  api.put(`/api/farms/${id}`, payload).then((r) => r.data)

export const getAdminOverview = () => api.get('/api/admin/overview').then((r) => r.data)

// ---- Crop advisor (suitability + lifecycle) ----
export const getCropList = () => api.get('/api/crops/list').then((r) => r.data)
export const getSeason = () => api.get('/api/crops/season').then((r) => r.data)
export const recommendCrops = (params: Record<string, any> = {}) =>
  api.get('/api/crops/recommend', { params }).then((r) => r.data)
export const getLifecycle = (crop: string) =>
  api.get(`/api/crops/lifecycle/${crop}`).then((r) => r.data)
export const getCropStage = (crop: string, daysAfterSowing: number) =>
  api.get(`/api/crops/lifecycle/${crop}/stage`, {
    params: { days_after_sowing: daysAfterSowing },
  }).then((r) => r.data)

// ---- Market ----
export const getMarketPrice = (crop: string, state?: string) =>
  api.get('/api/market/price', { params: { crop, state } }).then((r) => r.data)
export const getMyCropPrice = () => api.get('/api/market/my-crop').then((r) => r.data)

// ---- Fertilizer offers + ROI ----
export const getOffers = (state?: string) =>
  api.get('/api/fertilizer/offers', { params: { state } }).then((r) => r.data)
export const calculateROI = (payload: any) =>
  api.post('/api/fertilizer/roi', payload).then((r) => r.data)

// ---- Mandi prices (data.gov.in AGMARKNET, via our backend) ----
export const getMandiPrices = (params: Record<string, any>) =>
  api.get('/api/market-prices', { params }).then((r) => r.data)
export const getMandiSummary = (commodity: string, state?: string) =>
  api.get('/api/market-prices/summary', { params: { commodity, state } }).then((r) => r.data)
export const getMyMandiPrice = () =>
  api.get('/api/market-prices/my-crop').then((r) => r.data)
export const getCommodities = () =>
  api.get('/api/market-prices/commodities').then((r) => r.data)

// ---- Onboarding ----
export const getOnboardingStatus = () =>
  api.get('/api/onboarding/status').then((r) => r.data)
export const saveOnboarding = (payload: any) =>
  api.post('/api/onboarding/save', payload).then((r) => r.data)

// ---- Crop advisor ----
export const recommendAdvisory = (payload: any) =>
  api.post('/api/crop-advisor/recommend', payload).then((r) => r.data)
export const getMyCropStage = () =>
  api.get('/api/crop-advisor/my-crop-stage').then((r) => r.data)
export const getRotationAdvice = (previousCrop: string) =>
  api.get('/api/crop-advisor/rotation', { params: { previous_crop: previousCrop } })
    .then((r) => r.data)

// ---- Location ----
export const reverseGeocode = (lat: number, lon: number) =>
  api.get('/api/location/reverse', { params: { lat, lon } }).then((r) => r.data)
export const getDistricts = () =>
  api.get('/api/location/districts').then((r) => r.data)

// ---- Machinery rental ----
export const getMachineryCatalog = () =>
  api.get('/api/machinery/catalog').then((r) => r.data)
export const getMachineryStates = () =>
  api.get('/api/machinery/states').then((r) => r.data)
export const getMachineryGuide = (params: Record<string, any>) =>
  api.get('/api/machinery/guide', { params }).then((r) => r.data)
export const searchMachinery = (params: Record<string, any>) =>
  api.get('/api/machinery/search', { params }).then((r) => r.data)
export const machineryNearby = (lat: number, lon: number, radius_km = 100) =>
  api.get('/api/machinery/nearby', { params: { lat, lon, radius_km } })
    .then((r) => r.data)
export const revealMachineryContact = (id: number) =>
  api.post(`/api/machinery/listing/${id}/contact`).then((r) => r.data)
export const createMachineryListing = (fd: FormData) =>
  api.post('/api/machinery/listing', fd,
    { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
export const getMyMachineryListings = () =>
  api.get('/api/machinery/my-listings').then((r) => r.data)
export const deleteMachineryListing = (id: number) =>
  api.delete(`/api/machinery/listing/${id}`).then((r) => r.data)
export const setMachineryAvailability = (id: number, available: boolean) =>
  api.patch(`/api/machinery/listing/${id}/availability`, null,
    { params: { available } }).then((r) => r.data)

// ---- Marketplace (sell produce direct to buyers) ----
export const getPredictableCrops = () =>
  api.get('/api/marketplace/crops').then((r) => r.data)
export const predictMaturity = (crop: string, sowing_date: string) =>
  api.post('/api/marketplace/predict-maturity', { crop, sowing_date }).then((r) => r.data)
export const createListing = (payload: any) =>
  api.post('/api/marketplace/listings', payload).then((r) => r.data)
export const uploadListingPhoto = (id: number, file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post(`/api/marketplace/listings/${id}/photo`, fd).then((r) => r.data)
}
export const getAvailableCrops = (product_type = 'produce') =>
  api.get('/api/marketplace/crops-available', { params: { product_type } })
    .then((r) => r.data)
// Surplus compost sold through the same marketplace as produce, but kept
// separate in search so a sack of vermicompost never shows up in the crop grid.
export const createFertilizerListing = (payload: any) =>
  api.post('/api/marketplace/listings/fertilizer', payload).then((r) => r.data)
export const getFertilizerPriceSuggestion = (
  method = 'compost', quantity_kg?: number) =>
  api.get('/api/marketplace/fertilizer/price-suggestion',
    { params: { method, quantity_kg } }).then((r) => r.data)
export const updateListing = (id: number, payload: any) =>
  api.patch(`/api/marketplace/listings/${id}`, payload).then((r) => r.data)
export const withdrawListing = (id: number) =>
  api.delete(`/api/marketplace/listings/${id}`).then((r) => r.data)
export const getMyListings = () =>
  api.get('/api/marketplace/listings/mine').then((r) => r.data)
export const browseListings = (params: Record<string, any> = {}) =>
  api.get('/api/marketplace/listings', { params }).then((r) => r.data)
export const revealListingContact = (id: number) =>
  api.post(`/api/marketplace/listings/${id}/contact`).then((r) => r.data)
export const expressInterest = (id: number, payload: any = {}) =>
  api.post(`/api/marketplace/listings/${id}/interest`, payload).then((r) => r.data)
export const getMyOrders = () =>
  api.get('/api/marketplace/orders/mine').then((r) => r.data)
export const getReceivedOrders = () =>
  api.get('/api/marketplace/orders/received').then((r) => r.data)
export const respondToOrder = (id: number, status: string) =>
  api.post(`/api/marketplace/orders/${id}/respond`, { status }).then((r) => r.data)

// ---- Scheme interest (which schemes farmers actually chose) ----
export const markSchemeInterest = (id: number) =>
  api.post(`/api/schemes/${id}/interest`).then((r) => r.data)
export const getMySchemeInterests = () =>
  api.get('/api/schemes/mine/interests').then((r) => r.data)

// ---- Admin: command center ----
export const getAdminKPIs = () =>
  api.get('/api/admin/kpis').then((r) => r.data)
export const getFarmersBenefited = () =>
  api.get('/api/admin/farmers-benefited').then((r) => r.data)
export const getMarketplaceActivity = () =>
  api.get('/api/admin/marketplace-activity').then((r) => r.data)
export const getAdminStates = () =>
  api.get('/api/admin/states').then((r) => r.data)
export const getAdminDistricts = (state: string) =>
  api.get(`/api/admin/states/${encodeURIComponent(state)}/districts`).then((r) => r.data)
export const getAdminStateDetail = (state: string, district: string = '') =>
  api.get(`/api/admin/state/${encodeURIComponent(state)}`,
    { params: district ? { district } : {} }).then((r) => r.data)
export const getAdminPriorityAlerts = () =>
  api.get('/api/admin/priority-alerts').then((r) => r.data)
export const getAdminDisasterReports = () =>
  api.get('/api/admin/disaster-reports').then((r) => r.data)
export const getAdminDisasterReport = (id: number) =>
  api.get(`/api/admin/disaster-reports/${id}`).then((r) => r.data)
export const adminTakeResponsibility = (id: number) =>
  api.post(`/api/admin/disaster-reports/${id}/take-responsibility`).then((r) => r.data)
export const adminRequestHelp = (id: number, note: string = '') =>
  api.post(`/api/admin/disaster-reports/${id}/request-help`, null, { params: { note } }).then((r) => r.data)
export const getAdminPredictive = (state: string, metric: string = 'listings', crop: string = '') =>
  api.get(`/api/admin/predictive/${encodeURIComponent(state)}`,
    { params: { metric, crop: crop || undefined } }).then((r) => r.data)
export const getAdminEnvironment = (state: string, district: string = '') =>
  api.get(`/api/admin/environment/${encodeURIComponent(state)}`,
    { params: { district: district || undefined } }).then((r) => r.data)
export const runScenarioPestAdvisory = (state: string, district = '', crop = '') =>
  api.post('/api/admin/scenario/pest-advisory', null,
    { params: { state, district: district || undefined, crop: crop || undefined } }).then((r) => r.data)
export const runScenarioIrrigation = (state: string, district = '') =>
  api.post('/api/admin/scenario/irrigation-support', null,
    { params: { state, district: district || undefined } }).then((r) => r.data)
export const proposeAdminAction = (action_type: string, state: string, district = '', crop = '') =>
  api.post('/api/admin/actions/propose', null,
    { params: { action_type, state, district: district || undefined, crop: crop || undefined } })
    .then((r) => r.data)
export const listAdminActions = () =>
  api.get('/api/admin/actions').then((r) => r.data)
export const decideAdminAction = (id: number, status: 'approved' | 'rejected') =>
  api.post(`/api/admin/actions/${id}/decide`, null, { params: { status } }).then((r) => r.data)
export const askAdmin = (q: string, tab: string = '', state: string = '', district: string = '') =>
  api.get('/api/admin/ask', { params: { q, tab, state, district } }).then((r) => r.data)

// ---- Government Funding Intelligence (Agriculture Command Center) ----
export const getFundingOverview = (state = 'India') =>
  api.get('/api/admin/funding/overview', { params: { state } }).then((r) => r.data)
export const getSchemeBudgetList = (financial_year?: string) =>
  api.get('/api/admin/funding/schemes', { params: { financial_year } }).then((r) => r.data)
export const getSchemeDetail = (schemeId: number, financial_year?: string) =>
  api.get(`/api/admin/funding/schemes/${schemeId}`, { params: { financial_year } }).then((r) => r.data)
export const getStateFunding = (financial_year?: string, scheme_id?: number) =>
  api.get('/api/admin/funding/states', { params: { financial_year, scheme_id } }).then((r) => r.data)
export const getDistrictFunding = (state = 'Madhya Pradesh', financial_year?: string,
                                    scheme_id?: number, sort_by = 'allocated') =>
  api.get('/api/admin/funding/districts', { params: { state, financial_year, scheme_id, sort_by } }).then((r) => r.data)
export const getDistrictFundingDetail = (district: string, state = 'Madhya Pradesh', financial_year?: string) =>
  api.get(`/api/admin/funding/districts/${encodeURIComponent(district)}`,
    { params: { state, financial_year } }).then((r) => r.data)
export const getCoverageGap = (state = 'Madhya Pradesh', financial_year?: string) =>
  api.get('/api/admin/funding/coverage-gap', { params: { state, financial_year } }).then((r) => r.data)
export const getFinancialAlerts = (state = 'Madhya Pradesh', financial_year?: string) =>
  api.get('/api/admin/funding/financial-alerts', { params: { state, financial_year } }).then((r) => r.data)
export const getDistrictRanking = (state = 'Madhya Pradesh', financial_year?: string) =>
  api.get('/api/admin/funding/district-ranking', { params: { state, financial_year } }).then((r) => r.data)
export const getWhatChanged = (state = '') =>
  api.get('/api/admin/funding/what-changed', { params: { state } }).then((r) => r.data)
export const getCropHealthHeatmap = (state = 'Madhya Pradesh') =>
  api.get('/api/admin/funding/crop-health-heatmap', { params: { state } }).then((r) => r.data)
export const getSatelliteSummary = (district: string, state = 'Madhya Pradesh') =>
  api.get(`/api/admin/funding/satellite/${encodeURIComponent(district)}`, { params: { state } }).then((r) => r.data)
export const getMarketInsight = (state = 'Madhya Pradesh', crop = '') =>
  api.get('/api/admin/funding/market-insight', { params: { state, crop } }).then((r) => r.data)
export const getReportBrief = (state = 'Madhya Pradesh', financial_year?: string) =>
  api.get('/api/admin/funding/report-brief', { params: { state, financial_year } }).then((r) => r.data)
export const getSchemeEligibility = (state = 'Madhya Pradesh', district = '') =>
  api.get('/api/admin/funding/scheme-eligibility', { params: { state, district } }).then((r) => r.data)
export const runPestOutbreakScenario = (state: string, district = '', pest_name = '') =>
  api.post('/api/admin/funding/scenario/pest-outbreak', null,
    { params: { state, district, pest_name } }).then((r) => r.data)
export const getSchemeStateDistricts = (schemeId: number, state: string, financial_year?: string) =>
  api.get(`/api/admin/funding/schemes/${schemeId}/states/${encodeURIComponent(state)}/districts`,
    { params: { financial_year } }).then((r) => r.data)

// ---- Analytics: expenses (for spent-vs-earned) ----
export const addExpense = (category: string, amount: number, note = '', crop = '') =>
  api.post('/api/analytics/expenses', null, { params: { category, amount, note, crop } }).then((r) => r.data)
export const deleteExpense = (id: number) =>
  api.delete(`/api/analytics/expenses/${id}`).then((r) => r.data)
// ---- Satellite (Sentinel-2 via Google Earth Engine) ----
// All of these hit the backend, which holds the Earth Engine credentials.
// The browser never talks to Google and never receives a credential.
export const getSatelliteStatus = () =>
  api.get('/api/satellite/status').then((r) => r.data)
export const getSatelliteNdvi = (params: Record<string, any> = {}) =>
  api.get('/api/satellite/ndvi', { params }).then((r) => r.data)
export const getSatelliteField = (params: Record<string, any> = {}) =>
  api.get('/api/satellite/field', { params }).then((r) => r.data)
export const getSatelliteSeries = (params: Record<string, any> = {}) =>
  api.get('/api/satellite/timeseries', { params }).then((r) => r.data)
export const getSatelliteWaterStress = (params: Record<string, any> = {}) =>
  api.get('/api/satellite/water-stress', { params }).then((r) => r.data)
export const getSatelliteUniformity = (params: Record<string, any> = {}) =>
  api.get('/api/satellite/uniformity', { params }).then((r) => r.data)
export const getSatelliteHarvest = (params: Record<string, any> = {}) =>
  api.get('/api/satellite/harvest-readiness', { params }).then((r) => r.data)
export const getSatelliteScouting = (params: Record<string, any> = {}) =>
  api.get('/api/satellite/scouting', { params }).then((r) => r.data)
export const validateFieldLocation = (lat: number, lon: number) =>
  api.get('/api/satellite/validate-location', { params: { lat, lon } })
    .then((r) => r.data)
export const getSatelliteAnomaly = (params: Record<string, any> = {}) =>
  api.get('/api/satellite/season-anomaly', { params }).then((r) => r.data)
export const getSatelliteAlerts = () =>
  api.get('/api/satellite/alerts').then((r) => r.data)
export const getSatelliteHistory = (limit = 120) =>
  api.get('/api/satellite/history', { params: { limit } }).then((r) => r.data)

// ---- Server-side speech ----
export const getTtsStatus = () => api.get('/api/tts/status').then((r) => r.data)

// ---- Machinery: type-first browsing ----
// /types is the browse grid (names + cover photos + availability only).
// /type/{key} is the detail screen, where prices and contacts live.
export const getMachineTypes = (params: Record<string, any> = {}) =>
  api.get('/api/machinery/types', { params }).then((r) => r.data)
export const getMachineTypeDetail = (key: string, params: Record<string, any> = {}) =>
  api.get(`/api/machinery/type/${key}`, { params }).then((r) => r.data)
export const getMachineryPhotoCoverage = () =>
  api.get('/api/machinery/photo-coverage').then((r) => r.data)

// ---- Farm profile / setup gating ----
export const getFarmSetupStatus = () =>
  api.get('/api/farm/setup/status').then((r) => r.data)
export const getFarmProfile = () =>
  api.get('/api/farm/profile').then((r) => r.data)
export const getCurrentCropLifecycle = () =>
  api.get('/api/farm/current-crop/lifecycle').then((r) => r.data)
export const getCropLifecycleFor = (crop: string) =>
  api.get(`/api/farm/crop/${crop}/lifecycle`).then((r) => r.data)
export const getNextCrops = (limit = 5) =>
  api.get('/api/farm/next-crops', { params: { limit } }).then((r) => r.data)

// ---- Alerts: filters, summary, dismiss ----
export const getAlertsFiltered = (params: Record<string, any> = {}) =>
  api.get('/api/alerts', { params }).then((r) => r.data)
export const getAlertSummary = () =>
  api.get('/api/alerts/summary').then((r) => r.data)
export const dismissAlert = (id: number) =>
  api.post(`/api/alerts/${id}/dismiss`).then((r) => r.data)
export const markAllAlertsRead = () =>
  api.post('/api/alerts/read-all').then((r) => r.data)
export const getSupplyOffers = (category = '') =>
  api.get('/api/alerts/supply-offers', { params: { category } }).then((r) => r.data)

// ---- Push notifications ----
export const getNotificationStatus = () =>
  api.get('/api/alerts/notifications/status').then((r) => r.data)
export const subscribePush = (payload: any) =>
  api.post('/api/alerts/notifications/subscribe', payload).then((r) => r.data)
export const unsubscribePush = (endpoint: string) =>
  api.post('/api/alerts/notifications/unsubscribe', { endpoint }).then((r) => r.data)

// ---- Official advisories ----
export const getAdvisories = (kind = '') =>
  api.get('/api/advisories', { params: { kind } }).then((r) => r.data)

// ---- Circular farming (biogas / digestate / residue) ----
export const getLivestock = () =>
  api.get('/api/circular/livestock').then((r) => r.data)
export const saveLivestock = (entries: any[]) =>
  api.post('/api/circular/livestock', entries).then((r) => r.data)
export const getBiogasAssessment = () =>
  api.get('/api/circular/assessment').then((r) => r.data)
export const getCircularPlan = () =>
  api.get('/api/circular/plan').then((r) => r.data)
export const getDigestate = () =>
  api.get('/api/circular/digestate').then((r) => r.data)
export const allocateDigestate = (reserved_own_farm_kg: number, note = '') =>
  api.post('/api/circular/digestate/allocate', { reserved_own_farm_kg, note })
    .then((r) => r.data)
export const getManureCompare = (area_acres = 1) =>
  api.get('/api/circular/manure/compare', { params: { area_acres } })
    .then((r) => r.data)
export const getResidueAdvice = (crop = '') =>
  api.get('/api/circular/residue', { params: { crop } }).then((r) => r.data)
export const listSurplus = (payload: any) =>
  api.post('/api/circular/surplus/list', payload).then((r) => r.data)
export const searchSurplus = (params: Record<string, any> = {}) =>
  api.get('/api/circular/surplus/search', { params }).then((r) => r.data)
export const getTechnicians = () =>
  api.get('/api/circular/technicians').then((r) => r.data)
export const getBiogasScheme = () =>
  api.get('/api/circular/biogas-scheme').then((r) => r.data)
export const getManurePlan = (params: Record<string, any> = {}) =>
  api.get('/api/circular/manure/plan', { params }).then((r) => r.data)
// The farmer's chosen path (biogas / existing plant / manure) and the three
// composting answers, held server-side so reopening the page does not ask
// again.
export const getCircularChoice = () =>
  api.get('/api/circular/choice').then((r) => r.data)
export const saveCircularChoice = (payload: Record<string, any>) =>
  api.post('/api/circular/choice', payload).then((r) => r.data)
export const setManureKeep = (keep_kg: number) =>
  api.post('/api/circular/manure/keep', { keep_kg }).then((r) => r.data)
export const getMyBiogasPlant = () =>
  api.get('/api/circular/plant').then((r) => r.data)
export const registerBiogasPlant = (payload: any) =>
  api.post('/api/circular/plant', payload).then((r) => r.data)
export const addBiogasLog = (payload: any) =>
  api.post('/api/circular/plant/log', payload).then((r) => r.data)

// --- Land Contract Terms ---
export const proposeContractTerms = (contractId: number, data: any) =>
  api.post(`/api/land/contracts/${contractId}/terms`, data).then((r) => r.data)

export const getContractTermsHistory = (contractId: number) =>
  api.get(`/api/land/contracts/${contractId}/terms`).then((r) => r.data)

export const acceptContractTerms = (contractId: number, termsId: number) =>
  api.post(`/api/land/contracts/${contractId}/terms/${termsId}/accept`).then((r) => r.data)

export const translateText = (text: string, language: string) => {
  const fd = new FormData()
  fd.append('text', text)
  fd.append('language', language)
  return api.post('/api/ai/translate', fd).then((r) => r.data)
}
