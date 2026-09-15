import re

with open("frontend/src/pages/LandContractors.tsx", "r") as f:
    content = f.read()

# Replace ContractRequestModal
modal_pattern = re.compile(r"function ContractRequestModal\(\{(.*?)\}\n\)(.*?)function ContractCard", re.DOTALL)

def get_new_modal():
    return '''function ContractRequestModal({
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
    setLoading(true); setError('')
    try {
      // payload will be used for both the basic request and proposing terms
      await onSubmit({ 
        listing_id: listing.id, 
        ...form,
        duration_months: computedMonths,
        rent_amount: Number(estimatedTotal) || 0,
        payment_schedule: [{
          milestone_name: "Initial Payment",
          amount: Number(estimatedTotal) || 0,
          due_date: form.start_date
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
            <button onClick={submit} disabled={loading}
              className="flex-1 bg-field-700 hover:bg-field-600 text-white text-sm font-bold py-2.5 rounded-xl disabled:opacity-50 transition">
              {loading ? '⏳ Sending…' : '✅ Propose Terms'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ContractCard'''

import re

# We will just find function ContractRequestModal and replace it till function ContractCard
new_content = re.sub(r'function ContractRequestModal\(.*?function ContractCard', get_new_modal(), content, flags=re.DOTALL)

with open("frontend/src/pages/LandContractors.tsx", "w") as f:
    f.write(new_content)
