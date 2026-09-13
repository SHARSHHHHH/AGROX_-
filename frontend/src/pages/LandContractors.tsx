import { useEffect, useState } from 'react'
import {
  browseLandListings, getLandListingContact, requestLandContract,
  getMyLandContracts, cancelLandContract, getLandStats, getContractMessages, sendContractMessage, proposeContractTerms, getContractTermsHistory, acceptContractTerms,
  createPaymentOrder, verifyPayment, submitReview, openDispute, getApiBase
} from '../services/api'
import { Card, Spinner, Empty, Button } from '../components/UI'
import OtpSignModal from '../components/OtpSignModal'
import Tesseract from 'tesseract.js'
import { validateAadhaar } from '../utils/aadhaarValidator'

// ─── Types ────────────────────────────────────────────────────────────────────
interface LandListing {
  id: number
  farmer_name: string
  farmer_rating?: number
  farmer_review_count?: number
  title: string
  description: string
  state: string
  district: string
  village: string
  area_acres: number
  soil_type: string
  water_source: string
  irrigation_available: boolean
  suitable_crops: string[]
  price_per_acre_per_season: number
  min_season_months: number
  max_season_months: number
  available_from: string | null
  status: string
  image_path?: string
  documents_path?: string
  views: number
}

interface LandContract {
  id: number
  listing_id: number
  start_date: string
  end_date: string
  agreed_crop: string
  price_per_acre: number
  total_price: number
  status: string
  terms_accepted: boolean
  contract_pdf_url?: string
  farmer_notes: string
  buyer_notes: string
  listing_title: string
  listing_area_acres: number
  listing_state: string
  listing_district: string
  listing_village: string
  listing_suitable_crops: string[]
  farmer_name: string
  created_at: string
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const SOIL_ICONS: Record<string, string> = {
  Red: '🟥', Black: '⬛', Alluvial: '🟫', Loamy: '🟤', Sandy: '🟨',
  Clay: '🪨', Laterite: '🟧',
}
const WATER_ICONS: Record<string, string> = {
  borewell: '🕳️', canal: '🌊', rainfed: '🌧️', tank: '🪣', river: '💧',
}
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  completed: 'bg-blue-100 text-blue-800 border-blue-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
  ready_for_signing: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  partially_signed: 'bg-indigo-100 text-indigo-800 border-indigo-200',
}
const STATUS_ICONS: Record<string, string> = {
  pending: '⏳', active: '✅', completed: '🏁', cancelled: '❌', ready_for_signing: '✍️', partially_signed: '✍️',
}
const TABS = ['Browse Land', 'Waiting Contracts', 'My Contracts'] as const
type Tab = typeof TABS[number]

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatsBar({ stats }: { stats: any }) {
  return (
    <div className="grid grid-cols-2 gap-4 mb-6">
      <div className="rounded-2xl p-4 text-white flex flex-col gap-1"
        style={{ background: 'linear-gradient(135deg, #2d6a4f 0%, #52b788 100%)' }}>
        <div className="text-3xl font-bold">{stats.available_plots ?? '—'}</div>
        <div className="text-sm font-medium opacity-90">🏡 Plots Available for Rent</div>
      </div>
      <div className="rounded-2xl p-4 text-white flex flex-col gap-1"
        style={{ background: 'linear-gradient(135deg, #774936 0%, #b5838d 100%)' }}>
        <div className="text-3xl font-bold">{stats.rented_plots ?? '—'}</div>
        <div className="text-sm font-medium opacity-90">🤝 Plots Under Contract</div>
      </div>
    </div>
  )
}

function FilterBar({ onSearch }: { onSearch: (f: any) => void }) {
  const [f, setF] = useState({ state: '', district: '', soil_type: '', min_acres: '', max_price: '', crop: '' })
  return (
    <Card className="mb-5">
      <div className="font-semibold text-field-800 mb-3 text-sm">🔍 Filter Land Listings</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          { key: 'state', ph: 'State' },
          { key: 'district', ph: 'District' },
          { key: 'soil_type', ph: 'Soil type' },
          { key: 'crop', ph: 'Suitable crop' },
          { key: 'min_acres', ph: 'Min acres', type: 'number' },
          { key: 'max_price', ph: 'Max ₹/acre/season', type: 'number' },
        ].map(({ key, ph, type }) => (
          <input key={key} type={type || 'text'} placeholder={ph}
            value={(f as any)[key]}
            onChange={(e) => setF({ ...f, [key]: e.target.value })}
            className="border rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-field-600 bg-white" />
        ))}
      </div>
      <button onClick={() => onSearch(f)}
        className="mt-3 bg-field-700 hover:bg-field-600 text-white text-xs font-bold px-5 py-2 rounded-xl transition">
        Search
      </button>
      <button onClick={() => { setF({ state: '', district: '', soil_type: '', min_acres: '', max_price: '', crop: '' }); onSearch({}) }}
        className="mt-3 ml-2 text-xs text-gray-500 underline">Clear</button>
    </Card>
  )
}

function ListingCard({
  listing, onRent, onReveal, contactInfo,
}: {
  listing: LandListing
  onRent: (l: LandListing) => void
  onReveal: (id: number) => void
  contactInfo: Record<number, any>
}) {
  const ci = contactInfo[listing.id]
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col">
      {listing.image_path ? (
        <div className="h-32 w-full bg-gray-200 overflow-hidden">
          <img src={`${getApiBase()}${listing.image_path}`} alt="Land" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="h-1.5 w-full"
          style={{ background: listing.irrigation_available
            ? 'linear-gradient(90deg, #2d6a4f, #52b788)'
            : 'linear-gradient(90deg, #774936, #b5838d)' }} />
      )}

      <div className="p-4 flex-1 flex flex-col gap-3">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-bold text-field-800 text-sm leading-tight">{listing.title || 'Farm Land for Rent'}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              📍 {listing.village ? `${listing.village}, ` : ''}{listing.district}, {listing.state}
            </div>
          </div>
          <span className={`shrink-0 text-xs font-bold px-2 py-1 rounded-full border ${
            listing.status === 'available' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500'
          }`}>
            {listing.status === 'available' ? '✅ Available' : listing.status}
          </span>
        </div>

        {/* Key stats row */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-field-50 rounded-xl p-2 text-center">
            <div className="text-lg font-bold text-field-800">{listing.area_acres}</div>
            <div className="text-[10px] text-gray-500">Acres</div>
          </div>
          <div className="bg-amber-50 rounded-xl p-2 text-center">
            <div className="text-lg font-bold text-amber-800">₹{listing.price_per_acre_per_season.toLocaleString()}</div>
            <div className="text-[10px] text-gray-500">per acre/season</div>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-1 text-xs text-gray-600">
          <div className="flex gap-3 flex-wrap">
            {listing.soil_type && (
              <span>{SOIL_ICONS[listing.soil_type] || '🌱'} {listing.soil_type} soil</span>
            )}
            {listing.water_source && (
              <span>{WATER_ICONS[listing.water_source] || '💧'} {listing.water_source}</span>
            )}
            {listing.irrigation_available && <span className="text-emerald-600 font-medium">💦 Irrigation</span>}
          </div>
          <div>⏳ {listing.min_season_months}–{listing.max_season_months} months</div>
          {listing.available_from && (
            <div>📅 Available from: {new Date(listing.available_from).toLocaleDateString('en-IN')}</div>
          )}
        </div>

        {/* Suitable crops */}
        {listing.suitable_crops?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {listing.suitable_crops.map((c) => (
              <span key={c} className="text-[10px] bg-field-100 text-field-800 px-2 py-0.5 rounded-full font-medium">
                {c}
              </span>
            ))}
          </div>
        )}

        {/* Description */}
        {listing.description && (
          <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{listing.description}</p>
        )}

        {/* Farmer contact (revealed) */}
        {ci && (
          <div className="bg-field-50 rounded-xl p-2 text-xs border border-field-200">
            <div className="font-semibold text-field-800 flex justify-between items-center">
              <span>
                {ci.farmer_name} 
                {listing.farmer_review_count ? ` • ⭐ ${listing.farmer_rating?.toFixed(1)} (${listing.farmer_review_count})` : ''}
              </span>
              {listing.documents_path && <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold">✓ Verified Documents</span>}
            </div>
            <div className="text-field-700">📞 {ci.contact_phone}</div>
            {listing.documents_path && (
              <a href={`${getApiBase()}${listing.documents_path}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline text-[10px] block mt-1">
                View Land Documents
              </a>
            )}
            <p className="text-gray-400 mt-1 text-[10px]">{ci.safety_note}</p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="px-4 pb-4 flex gap-2">
        <button
          onClick={() => onRent(listing)}
          disabled={listing.status !== 'available'}
          className="flex-1 bg-field-700 hover:bg-field-600 disabled:opacity-40 text-white text-xs font-bold py-2 rounded-xl transition">
          🤝 Request Contract
        </button>
        <button
          onClick={() => onReveal(listing.id)}
          className="bg-white border border-gray-200 hover:bg-gray-50 text-xs font-semibold py-2 px-3 rounded-xl transition">
          📞
        </button>
      </div>
    </div>
  )
}

function ContractRequestModal({
  listing, onClose, onSubmit,
}: {
  listing: LandListing
  onClose: () => void
  onSubmit: (payload: any) => Promise<void>
}) {
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({
    start_date: today,
    end_date: '',
    agreed_crop: listing.suitable_crops?.[0] || '',
    duration_months: 6,
    security_deposit_amount: 0,
    renewal_terms: 'none',
    exit_clause: 'Standard',
    special_conditions: '',
    terms_accepted: false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [aadhaarFile, setAadhaarFile] = useState<File | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [extractedAadhaar, setExtractedAadhaar] = useState('')

  // Compute duration in months strictly based on start and end dates to ensure it matches
  const computedMonths = form.start_date && form.end_date
    ? Math.max(1, Math.round((new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / (30 * 86400000)))
    : form.duration_months
    
  const showLegalWarning = computedMonths >= 12 || form.renewal_terms === 'year-to-year'

  const estimatedTotal = computedMonths > 0
    ? (listing.price_per_acre_per_season * listing.area_acres * computedMonths / 6).toFixed(0)
    : '—'

  const submit = async () => {
    if (!form.end_date) { setError('Please select an end date'); return }
    if (!form.terms_accepted) { setError('Please accept the terms'); return }
    if (!aadhaarFile) { setError('Please upload your Aadhaar card for KYC'); return }
    
    setLoading(true); setError('')
    try {
      if (!extractedAadhaar) {
        setIsScanning(true)
        try {
          const result = await Tesseract.recognize(aadhaarFile, 'eng')
          const text = result.data.text
          const possibleNumbers = text.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/g)
          
          if (possibleNumbers && possibleNumbers.length > 0) {
            let foundValid = false;
            for (const num of possibleNumbers) {
              if (validateAadhaar(num)) {
                 setExtractedAadhaar('XXXX-XXXX-' + num.replace(/\s/g, '').slice(-4))
                 foundValid = true;
                 break;
              }
            }
            if (!foundValid) {
                throw new Error("Found 12 digits, but it is not a mathematically valid Aadhaar number (Failed Checksum).")
            }
          } else {
            throw new Error("Could not find a 12-digit Aadhaar number in the image.")
          }
        } catch (e: any) {
            setError("OCR Failed: " + (e.message || 'Unable to scan document'))
            return
        } finally {
            setIsScanning(false)
            setLoading(false)
        }
        return // Stop here so the user can see the success state before submitting
      }

      // payload will be used for both the basic request and proposing terms
      await onSubmit({ 
        listing_id: listing.id, 
        ...form,
        duration_months: computedMonths,
        rent_amount: Number(estimatedTotal) || 0,
        payment_schedule: [{
          label: "Initial Payment",
          amount: Number(estimatedTotal) || 0,
          due_event: form.start_date
        }],
        allowed_crops: [form.agreed_crop]
      })
      onClose()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-5 text-white shrink-0"
          style={{ background: 'linear-gradient(135deg, #2d6a4f 0%, #52b788 100%)' }}>
          <div className="font-bold text-lg">🤝 Request Land Contract</div>
          <div className="text-sm opacity-90 mt-0.5">{listing.title || 'Farm Land'} · {listing.area_acres} acres · {listing.district}</div>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Price info */}
          <div className="bg-amber-50 rounded-2xl p-3 flex justify-between items-center">
            <div className="text-xs text-gray-500">Rate</div>
            <div className="font-bold text-amber-800">₹{listing.price_per_acre_per_season.toLocaleString()}/acre/season</div>
          </div>

          {/* Date pickers */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Start Date</label>
              <input type="date" value={form.start_date} min={today}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-field-600" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">End Date</label>
              <input type="date" value={form.end_date} min={form.start_date || today}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-field-600" />
            </div>
          </div>

          {showLegalWarning && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-xl text-xs">
              <strong>⚠️ Legal Notice:</strong> Since the lease duration is 12 months or longer (or year-to-year), it must be legally registered under Section 17 of the Registration Act, 1908. This platform provides terms tracking but you must consult a lawyer for official registration.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* Security Deposit */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Security Deposit (₹)</label>
              <input type="number" min={0} value={form.security_deposit_amount}
                onChange={(e) => setForm({ ...form, security_deposit_amount: Number(e.target.value) })}
                className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-field-600" />
            </div>
            {/* Renewal terms */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Renewal Terms</label>
              <select value={form.renewal_terms}
                onChange={(e) => setForm({ ...form, renewal_terms: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-field-600">
                <option value="none">None</option>
                <option value="mutual">Mutual Agreement</option>
                <option value="year-to-year">Year-to-Year</option>
              </select>
            </div>
          </div>

          {/* Crop selection */}
          <div>
            <label className="text-xs text-gray-500 block mb-1">Planned Crop</label>
            {listing.suitable_crops?.length > 0 ? (
              <select value={form.agreed_crop}
                onChange={(e) => setForm({ ...form, agreed_crop: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-field-600">
                <option value="">— Select crop —</option>
                {listing.suitable_crops.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
                <option value="other">Other</option>
              </select>
            ) : (
              <input placeholder="e.g. Rice, Wheat" value={form.agreed_crop}
                onChange={(e) => setForm({ ...form, agreed_crop: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-field-600" />
            )}
          </div>

          {/* Exit Clause */}
          <div>
            <label className="text-xs text-gray-500 block mb-1">Exit Clause</label>
            <select value={form.exit_clause}
                onChange={(e) => setForm({ ...form, exit_clause: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-field-600">
                <option value="Standard">Standard (1 month notice)</option>
                <option value="No early exit">No early exit</option>
            </select>
          </div>

          {/* Special conditions */}
          <div>
            <label className="text-xs text-gray-500 block mb-1">Special Conditions (optional)</label>
            <textarea rows={2} placeholder="Any specific requirements or agreements..."
              value={form.special_conditions}
              onChange={(e) => setForm({ ...form, special_conditions: e.target.value })}
              className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-field-600 resize-none" />
          </div>

          {/* Aadhaar KYC */}
          <div className="bg-gray-50 border p-3 rounded-xl">
            <h4 className="text-xs font-bold text-gray-700 mb-2">Buyer KYC (Aadhaar Scan)</h4>
            {!extractedAadhaar ? (
              <input type="file" accept="image/*" onChange={e => {
                if (e.target.files?.[0]) {
                  setAadhaarFile(e.target.files[0])
                  setExtractedAadhaar('')
                }
              }} className="block w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-field-50 file:text-field-700 hover:file:bg-field-100" />
            ) : (
              <div className="text-xs text-emerald-800 font-bold">
                ✅ Aadhaar Verified ({extractedAadhaar})
              </div>
            )}
            {isScanning && (
              <div className="flex items-center gap-2 text-field-600 font-bold text-xs mt-2">
                <Spinner /> Scanning document...
              </div>
            )}
          </div>

          {/* Terms */}
          <label className="flex items-start gap-2 cursor-pointer mt-4">
            <input type="checkbox" checked={form.terms_accepted}
              onChange={(e) => setForm({ ...form, terms_accepted: e.target.checked })}
              className="mt-0.5 accent-field-700" />
            <span className="text-xs text-gray-600">
              I understand that all produce grown on this land during the contract period belongs to me (the buyer/contractor), and I agree to the rental terms.
            </span>
          </label>

          {error && <div className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 mt-2">{error}</div>}

          <div className="flex gap-2 mt-4 pt-4 border-t shrink-0">
            <button onClick={onClose}
              className="flex-1 border rounded-xl py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={submit} disabled={loading || isScanning}
              className="flex-1 bg-field-700 hover:bg-field-600 text-white text-sm font-bold py-2.5 rounded-xl disabled:opacity-50 transition">
              {(loading || isScanning) ? '⏳ Processing…' : (!extractedAadhaar ? 'Scan Aadhaar' : '✅ Propose Terms')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ContractCard({ c, onCancel, onOpenChat, onViewTerms, onPayEscrow, onReview, onDispute, onSignOTP }: { c: LandContract; onCancel?: (id: number) => void; onOpenChat?: (id: number) => void; onViewTerms?: (id: number) => void; onPayEscrow?: (id: number) => void; onReview?: (id: number) => void; onDispute?: (id: number) => void; onSignOTP?: (id: number) => void }) {
  const start = c.start_date ? new Date(c.start_date).toLocaleDateString('en-IN') : '—'
  const end = c.end_date ? new Date(c.end_date).toLocaleDateString('en-IN') : '—'
  const months = c.start_date && c.end_date
    ? Math.max(1, Math.round((new Date(c.end_date).getTime() - new Date(c.start_date).getTime()) / (30 * 86400000)))
    : 0

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
      c.status === 'active' ? 'border-emerald-200 ring-1 ring-emerald-100' : 'border-gray-100'
    }`}>
      {/* Status bar */}
      <div className={`flex items-center justify-between px-4 py-2 text-xs font-bold ${STATUS_COLORS[c.status] || 'bg-gray-50 text-gray-600'}`}>
        <span>{STATUS_ICONS[c.status]} {c.status.toUpperCase()}</span>
        <span>#{c.id}</span>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <div className="font-bold text-field-800 text-sm">{c.listing_title || 'Farm Land'}</div>
          <div className="text-xs text-gray-500">
            📍 {c.listing_village ? `${c.listing_village}, ` : ''}{c.listing_district}, {c.listing_state}
          </div>
          <div className="text-xs text-gray-500">👨‍🌾 Farmer: {c.farmer_name}</div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-field-50 rounded-xl p-2 text-center">
            <div className="font-bold text-field-800 text-sm">{c.listing_area_acres}</div>
            <div className="text-[10px] text-gray-500">Acres</div>
          </div>
          <div className="bg-amber-50 rounded-xl p-2 text-center">
            <div className="font-bold text-amber-800 text-sm">{months}m</div>
            <div className="text-[10px] text-gray-500">Duration</div>
          </div>
          <div className="bg-purple-50 rounded-xl p-2 text-center">
            <div className="font-bold text-purple-800 text-sm">₹{c.total_price ? Math.round(c.total_price).toLocaleString() : '—'}</div>
            <div className="text-[10px] text-gray-500">Total</div>
          </div>
        </div>

        <div className="text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
          <span>📅 {start} → {end}</span>
          {c.agreed_crop && <span>🌱 Crop: <strong>{c.agreed_crop}</strong></span>}
        </div>

        {c.status === 'active' && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs flex flex-col gap-2">
            <div>
              <div className="font-bold text-emerald-800 mb-1">🌾 Your Active Contract</div>
              <p className="text-emerald-700">
                All produce grown on this land between <strong>{start}</strong> and <strong>{end}</strong> belongs to you.
                Coordinate directly with the farmer for sowing and harvesting schedules.
              </p>
            </div>
            {c.contract_pdf_url && (
              <a href={`${getApiBase()}${c.contract_pdf_url}`} target="_blank" rel="noopener noreferrer" className="bg-white border border-emerald-200 text-emerald-700 font-bold py-1.5 px-3 rounded text-center block mt-1 hover:bg-emerald-100 transition">
                📄 View/Download Immutable Contract PDF
              </a>
            )}
          </div>
        )}

        {c.farmer_notes && (
          <div className="text-xs bg-gray-50 rounded-xl px-3 py-2">
            <span className="text-gray-400">Farmer note: </span>{c.farmer_notes}
          </div>
        )}

        <div className="flex gap-2 mt-2">
          {c.status === 'pending' && onCancel && (
            <button onClick={() => onCancel(c.id)}
              className="flex-1 text-xs text-red-600 border border-red-200 hover:bg-red-50 py-2 rounded-xl font-medium transition">
              Cancel Request
            </button>
          )}
          
          <button onClick={() => onViewTerms && onViewTerms(c.id)}
            className="flex-1 text-xs bg-gray-100 py-2 rounded-xl font-medium hover:bg-gray-200 transition">
            📝 View Terms
          </button>

          {onOpenChat && (
            <button onClick={() => onOpenChat(c.id)}
              className="flex-1 text-xs border py-2 rounded-xl font-medium hover:bg-gray-50 transition">
              💬 Message Farmer
            </button>
          )}
        </div>
        
        {c.status === 'active' && onPayEscrow && (
          <button onClick={() => onPayEscrow(c.id)} className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 rounded-xl transition shadow">
            💳 Pay Security Deposit to Escrow
          </button>
        )}
        
        {(c.status === 'ready_for_signing' || c.status === 'partially_signed') && onSignOTP && (
          <button onClick={() => onSignOTP(c.id)} className="w-full mt-2 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-800 text-xs font-bold py-2 rounded-xl transition shadow">
            ✍️ Sign via OTP
          </button>
        )}
        
        {c.status === 'active' && onReview && onDispute && (
          <div className="flex gap-2 mt-2">
            <button onClick={() => onReview(c.id)} className="flex-1 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 text-xs font-bold py-2 rounded-xl transition">
              ⭐ Rate Farmer
            </button>
            <button onClick={() => onDispute(c.id)} className="flex-1 bg-red-100 hover:bg-red-200 text-red-800 text-xs font-bold py-2 rounded-xl transition">
              ⚖️ Open Dispute
            </button>
          </div>
        )}
      </div>
    </div>
  )
}


function TermsModal({
  contractId, onClose
}: {
  contractId: number
  onClose: () => void
}) {
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const u = localStorage.getItem('user')
    if (u) setUser(JSON.parse(u))
    loadHistory()
  }, [])

  const loadHistory = () => {
    setLoading(true)
    getContractTermsHistory(contractId)
      .then(setHistory)
      .catch((e) => setError(e?.response?.data?.detail || 'Failed to load terms history'))
      .finally(() => setLoading(false))
  }

  const handleAccept = async (termsId: number) => {
    setAccepting(true)
    setError('')
    try {
      await acceptContractTerms(contractId, termsId)
      setToast('Terms accepted successfully')
      setTimeout(() => setToast(''), 3000)
      loadHistory()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to accept terms')
    } finally {
      setAccepting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-5 text-white shrink-0"
          style={{ background: 'linear-gradient(135deg, #774936 0%, #b5838d 100%)' }}>
          <div className="font-bold text-lg">📝 Terms Version History</div>
          <div className="text-sm opacity-90 mt-0.5">Contract #{contractId}</div>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {toast && <div className="text-xs text-emerald-800 bg-emerald-100 rounded-xl px-3 py-2">{toast}</div>}
          {error && <div className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</div>}
          
          {loading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : history.length === 0 ? (
            <div className="text-center text-sm text-gray-500 py-8">No terms history found.</div>
          ) : (
            history.map((t, idx) => {
              const isLatest = idx === 0
              const acceptedByBoth = t.accepted_by_buyer_at && t.accepted_by_farmer_at
              const amIBuyer = true // this is buyer side view
              const myAcceptance = t.accepted_by_buyer_at
              const theirAcceptance = t.accepted_by_farmer_at
              
              return (
                <div key={t.id} className={`border rounded-2xl p-4 ${isLatest ? 'border-field-300 bg-field-50 shadow-sm' : 'border-gray-200 bg-gray-50 opacity-75'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <div className="font-bold text-sm text-gray-800 flex items-center gap-2">
                      Version {t.version}
                      {isLatest && <span className="bg-field-100 text-field-700 text-[10px] px-2 py-0.5 rounded-full">LATEST</span>}
                    </div>
                    <div className="text-xs text-gray-500">{new Date(t.created_at).toLocaleString('en-IN')}</div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-3">
                    <div><strong>Duration:</strong> {t.duration_months} months</div>
                    <div><strong>Rent:</strong> ₹{t.rent_amount}</div>
                    <div><strong>Deposit:</strong> ₹{t.security_deposit_amount}</div>
                    <div><strong>Renewal:</strong> {t.renewal_terms}</div>
                    <div><strong>Exit:</strong> {t.exit_clause}</div>
                    <div><strong>Crops:</strong> {t.allowed_crops?.join(', ')}</div>
                    {t.special_conditions && <div className="col-span-2"><strong>Notes:</strong> {t.special_conditions}</div>}
                  </div>

                  <div className="flex flex-col gap-1 text-xs">
                    <div className="flex justify-between items-center bg-white p-2 rounded border">
                      <span>Buyer Accepted: {t.accepted_by_buyer_at ? '✅ ' + new Date(t.accepted_by_buyer_at).toLocaleDateString() : '⏳ Pending'}</span>
                      {isLatest && !t.accepted_by_buyer_at && !t.superseded_by_id && (
                         <button onClick={() => handleAccept(t.id)} disabled={accepting} className="bg-field-700 text-white px-3 py-1 rounded font-bold hover:bg-field-600 disabled:opacity-50">
                           {accepting ? '...' : 'Accept'}
                         </button>
                      )}
                    </div>
                    <div className="flex justify-between items-center bg-white p-2 rounded border">
                      <span>Farmer Accepted: {t.accepted_by_farmer_at ? '✅ ' + new Date(t.accepted_by_farmer_at).toLocaleDateString() : '⏳ Pending'}</span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
        
        <div className="p-4 border-t flex justify-end bg-gray-50 shrink-0">
          <button onClick={onClose} className="px-5 py-2 border rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-100 transition">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function LandContractors() {
  const [tab, setTab] = useState<Tab>('Browse Land')
  const [stats, setStats] = useState<any>({})
  const [listings, setListings] = useState<LandListing[] | null>(null)
  const [contracts, setContracts] = useState<LandContract[] | null>(null)
  const [contactInfo, setContactInfo] = useState<Record<number, any>>({})
  const [selectedListing, setSelectedListing] = useState<LandListing | null>(null)
  const [toastMsg, setToastMsg] = useState('')

  // Messaging State
  const [activeChat, setActiveChat] = useState<number | null>(null)
  const [viewingTermsFor, setViewingTermsFor] = useState<number | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [msgInput, setMsgInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [signingContract, setSigningContract] = useState<number | null>(null)

  const loadChat = (contractId: number) => {
    setChatLoading(true)
    getContractMessages(contractId)
      .then(setMessages)
      .catch(() => {})
      .finally(() => setChatLoading(false))
  }

  const handleOpenChat = (contractId: number) => {
    setActiveChat(contractId)
    loadChat(contractId)
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!msgInput.trim() || !activeChat) return
    const txt = msgInput
    setMsgInput('')
    try {
      const newMsg = await sendContractMessage(activeChat, txt)
      setMessages(prev => [...prev, newMsg])
    } catch (err) {
      console.error(err)
    }
  }

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 3500)
  }

  useEffect(() => {
    getLandStats().then(setStats).catch(() => {})
    loadListings({})
  }, [])

  useEffect(() => {
    if (tab === 'My Contracts' || tab === 'Waiting Contracts') loadContracts()
  }, [tab])

  const loadListings = (params: any) => {
    setListings(null)
    const clean: any = {}
    if (params.state) clean.state = params.state
    if (params.district) clean.district = params.district
    if (params.soil_type) clean.soil_type = params.soil_type
    if (params.min_acres) clean.min_acres = Number(params.min_acres)
    if (params.max_price) clean.max_price = Number(params.max_price)
    if (params.crop) clean.crop = params.crop
    browseLandListings(clean)
      .then(setListings)
      .catch(() => setListings([]))
  }

  const loadContracts = () => {
    setContracts(null)
    getMyLandContracts().then(setContracts).catch(() => setContracts([]))
  }

  const handleReveal = async (id: number) => {
    if (contactInfo[id]) return
    try {
      const info = await getLandListingContact(id)
      setContactInfo((prev) => ({ ...prev, [id]: info }))
    } catch {
      showToast('Could not retrieve contact info')
    }
  }

  const handleRequestContract = async (payload: any) => {
    try {
      const contract = await requestLandContract(payload)
      // propose the structured terms
      await proposeContractTerms(contract.id, {
        duration_months: payload.duration_months,
        rent_amount: payload.rent_amount,
        payment_schedule: payload.payment_schedule,
        security_deposit_amount: payload.security_deposit_amount,
        renewal_terms: payload.renewal_terms,
        exit_clause: payload.exit_clause,
        allowed_crops: payload.allowed_crops,
        special_conditions: payload.special_conditions
      })
      showToast('✅ Contract request sent! The farmer will respond shortly.')
      loadContracts()
    } catch (e: any) {
      const detail = e?.response?.data?.detail
      let errMsg = 'Failed to request contract'
      if (typeof detail === 'string') {
        errMsg = detail
      } else if (Array.isArray(detail)) {
        errMsg = detail.map((d: any) => `${d.loc?.join('.')} ${d.msg}`).join(', ')
      }
      showToast('Error: ' + errMsg)
    }
  }

  const handleCancelContract = async (id: number) => {
    await cancelLandContract(id)
    showToast('Contract request cancelled.')
    loadContracts()
  }

  const handlePayEscrow = async (contractId: number) => {
    try {
      showToast('Initiating payment...')
      const order = await createPaymentOrder({ contract_id: contractId, amount: 10000, purpose: 'security_deposit' })
      
      // Mock payment flow
      setTimeout(async () => {
        try {
          await verifyPayment({ order_id: order.order_id, payment_id: 'mock_pay_123', signature: 'mock_sig' })
          showToast('✅ Escrow payment successful! Funds locked securely.')
        } catch (e) {
          showToast('❌ Payment verification failed.')
        }
      }, 1500)
    } catch (e: any) {
      showToast('Error: ' + (e?.response?.data?.detail || 'Payment failed'))
    }
  }

  const handleReview = async (contractId: number) => {
    const ratingStr = prompt('Enter rating (1-5):', '5')
    if (!ratingStr) return
    const rating = parseInt(ratingStr)
    const comment = prompt('Optional review comment:', '') || ''
    try {
      await submitReview({ contract_id: contractId, rating, comment })
      showToast('✅ Review submitted!')
    } catch (e: any) {
      showToast('❌ ' + (e?.response?.data?.detail || 'Failed to submit review'))
    }
  }

  const handleDispute = async (contractId: number) => {
    const reason = prompt('Enter reason for dispute:')
    if (!reason) return
    try {
      await openDispute({ contract_id: contractId, reason })
      showToast('⚖️ Dispute opened. Our team will review this.')
    } catch (e: any) {
      showToast('❌ ' + (e?.response?.data?.detail || 'Failed to open dispute'))
    }
  }

  const waitingContractsList = (contracts || []).filter((c) => ['pending', 'ready_for_signing', 'partially_signed'].includes(c.status))
  const myContractsList = (contracts || []).filter((c) => ['active', 'completed', 'cancelled'].includes(c.status))

  return (
    <div className="max-w-5xl relative">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-field-800 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl animate-bounce-in">
          {toastMsg}
        </div>
      )}
      
      {signingContract && (
        <OtpSignModal 
          contractId={signingContract} 
          role="Buyer" 
          onClose={() => setSigningContract(null)}
          onSuccess={() => {
            setSigningContract(null)
            loadContracts()
          }}
        />
      )}

      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-field-800 flex items-center gap-2">
          🏡 Land Contractors
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Rent farmland directly from farmers. For the contract period, everything grown on that land is yours.
        </p>
      </div>

      {/* Stats bar */}
      <StatsBar stats={stats} />

      {/* Tab nav */}
      <div className="flex gap-2 mb-5 bg-gray-100 p-1 rounded-2xl w-fit">
        {TABS.map((t) => (
          <button key={t} onClick={() => { setTab(t); setActiveChat(null) }}
            className={`px-5 py-2 text-sm font-semibold rounded-xl transition-all duration-150 ${
              tab === t
                ? 'bg-white text-field-800 shadow-sm'
                : 'text-gray-500 hover:text-field-700'
            }`}>
            {t === 'Browse Land' ? '🔍 Browse Land' : t === 'Waiting Contracts' ? `⏳ Waiting Contracts${contracts ? ` (${waitingContractsList.length})` : ''}` : `📋 My Contracts${contracts ? ` (${myContractsList.length})` : ''}`}
          </button>
        ))}
      </div>

      
      {viewingTermsFor && (
        <TermsModal contractId={viewingTermsFor} onClose={() => setViewingTermsFor(null)} />
      )}

      {/* ── BROWSE TAB ─────────────────────────────────────────────────────── */}
      {tab === 'Browse Land' && (
        <div>
          <FilterBar onSearch={loadListings} />

          {listings === null ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : listings.length === 0 ? (
            <Card>
              <Empty msg="No land listings match your filters. Try broadening the search or check back later." />
            </Card>
          ) : (
            <>
              <div className="text-xs text-gray-400 mb-3">{listings.length} plot{listings.length !== 1 ? 's' : ''} found</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {listings.map((l) => (
                  <ListingCard
                    key={l.id}
                    listing={l}
                    onRent={setSelectedListing}
                    onReveal={handleReveal}
                    contactInfo={contactInfo}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── WAITING CONTRACTS & MY CONTRACTS TABS ──────────────────────────── */}
      {(tab === 'My Contracts' || tab === 'Waiting Contracts') && (
        <div>
          {activeChat ? (
            <Card className="flex flex-col h-[500px]">
              <div className="flex justify-between items-center mb-4 pb-4 border-b">
                <h3 className="font-bold text-lg">Chat with Farmer</h3>
                <Button variant="outline" onClick={() => setActiveChat(null)}>Back</Button>
              </div>
              <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-2">
                {chatLoading ? <Spinner /> : messages.length === 0 ? (
                  <p className="text-gray-400 text-center text-sm italic mt-10">No messages yet. Say hello!</p>
                ) : (
                  messages.map(m => (
                    <div key={m.id} className={`flex ${m.is_mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] p-3 rounded-2xl ${
                        m.is_mine ? 'bg-field-600 text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none'
                      }`}>
                        <div className="text-xs opacity-70 mb-1">{m.sender_name}</div>
                        <div className="text-sm whitespace-pre-wrap">{m.content}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={msgInput}
                  onChange={e => setMsgInput(e.target.value)}
                  className="flex-1 border rounded-lg px-4 py-2"
                  placeholder="Type a message..."
                />
                <Button type="submit">Send</Button>
              </form>
            </Card>
          ) : contracts === null ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : tab === 'Waiting Contracts' ? (
            waitingContractsList.length === 0 ? (
              <Card>
                <Empty msg="You have no waiting contracts." />
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {waitingContractsList.map((c) => (
                  <ContractCard key={c.id} c={c} onCancel={handleCancelContract} onOpenChat={handleOpenChat}
                    onViewTerms={setViewingTermsFor} onSignOTP={setSigningContract} />
                ))}
              </div>
            )
          ) : (
            myContractsList.length === 0 ? (
              <Card>
                <Empty msg="You have no active or completed contracts." />
              </Card>
            ) : (
              <div className="space-y-6">
                <div>
                  <div className="text-sm font-bold text-emerald-800 mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full inline-block animate-pulse" />
                    My Contracts
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {myContractsList.map((c) => (
                      <ContractCard key={c.id} c={c} onOpenChat={handleOpenChat}
                    onViewTerms={setViewingTermsFor} onPayEscrow={handlePayEscrow} onReview={handleReview} onDispute={handleDispute} onCancel={handleCancelContract} />
                    ))}
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Contract request modal */}
      {selectedListing && (
        <ContractRequestModal
          listing={selectedListing}
          onClose={() => setSelectedListing(null)}
          onSubmit={handleRequestContract}
        />
      )}
    
      {/* Legal Footer */}
      <div className="mt-8 mb-4 p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500">
        <strong>⚠️ Legal Disclaimer:</strong> This platform facilitates the tracking of terms and escrow payments for land leases. It does not replace formal legal registration. For leases of 12 months or longer, or year-to-year leases, the Registration Act, 1908 requires formal registration. Both parties are advised to consult with a legal professional to ensure compliance with local laws.
      </div>
</div>
  )
}
