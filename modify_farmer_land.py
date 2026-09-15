import re

with open("frontend/src/pages/FarmerLand.tsx", "r") as f:
    content = f.read()

# Add imports
content = content.replace("respondToLandContract, getContractMessages, sendContractMessage", "respondToLandContract, getContractMessages, sendContractMessage, getContractTermsHistory, acceptContractTerms")

terms_modal_code = '''
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

  useEffect(() => {
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
                    </div>
                    <div className="flex justify-between items-center bg-white p-2 rounded border">
                      <span>Farmer Accepted: {t.accepted_by_farmer_at ? '✅ ' + new Date(t.accepted_by_farmer_at).toLocaleDateString() : '⏳ Pending'}</span>
                      {isLatest && !t.accepted_by_farmer_at && !t.superseded_by_id && (
                         <button onClick={() => handleAccept(t.id)} disabled={accepting} className="bg-field-700 text-white px-3 py-1 rounded font-bold hover:bg-field-600 disabled:opacity-50">
                           {accepting ? '...' : 'Accept'}
                         </button>
                      )}
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
'''

content = content.replace("export default function FarmerLand() {", terms_modal_code + "\nexport default function FarmerLand() {")

# Add a state to manage viewing terms modal in the main component
content = content.replace("const [chatLoading, setChatLoading] = useState(false)", "const [chatLoading, setChatLoading] = useState(false)\n  const [viewingTermsFor, setViewingTermsFor] = useState<number | null>(null)")

view_terms_button = '''
                <Button variant="outline" onClick={() => setViewingTermsFor(r.id)}>
                  📝 View Terms
                </Button>
'''

content = content.replace("<Button variant=\"outline\" onClick={() => handleOpenChat(r.id)}>", view_terms_button + "\n                <Button variant=\"outline\" onClick={() => handleOpenChat(r.id)}>")

terms_modal_render = '''
      {viewingTermsFor && (
        <TermsModal contractId={viewingTermsFor} onClose={() => setViewingTermsFor(null)} />
      )}
'''

content = content.replace("{/* Tabs */}", terms_modal_render + "\n      {/* Tabs */}")

with open("frontend/src/pages/FarmerLand.tsx", "w") as f:
    f.write(content)

