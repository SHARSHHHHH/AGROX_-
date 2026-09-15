import { useEffect, useState } from 'react'
import {
  createLandListing, getMyLandListings, getIncomingLandContracts,
  respondToLandContract, getContractMessages, sendContractMessage, getContractTermsHistory, acceptContractTerms, uploadLandDocuments,
  submitReview, openDispute, getApiBase
} from '../services/api'
import { Card, Button, Spinner, StatusPill } from '../components/UI'
import ListingWizard from '../components/ListingWizard'
import OtpSignModal from '../components/OtpSignModal'
import { useLanguage } from '../contexts/LanguageContext'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  completed: 'bg-blue-100 text-blue-800 border-blue-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
  available: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rented: 'bg-blue-100 text-blue-800 border-blue-200',
  withdrawn: 'bg-gray-100 text-gray-800 border-gray-200',
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
  const { t: tr } = useLanguage()

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
            <div className="text-center text-sm text-gray-500 py-8">{tr('land.notermshistory')}</div>
          ) : (
            history.map((t, idx) => {
              const isLatest = idx === 0
              
              return (
                <div key={t.id} className={`border rounded-2xl p-4 ${isLatest ? 'border-field-300 bg-field-50 shadow-sm' : 'border-gray-200 bg-gray-50 opacity-75'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <div className="font-bold text-sm text-gray-800 flex items-center gap-2">
                      Version {t.version}
                      {isLatest && <span className="bg-field-100 text-field-700 text-[10px] px-2 py-0.5 rounded-full">{tr('land.latest')}</span>}
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

export default function FarmerLand() {
  const { t } = useLanguage()
  const [tab, setTab] = useState<'upload' | 'myland' | 'requests'>('upload')
  const [listings, setListings] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Upload Form State
  const [form, setForm] = useState({
    area_acres: '', soil_type: 'Red', water_source: 'Rainfed',
    irrigation_available: false, suitable_crops: '', price_per_acre_per_season: '',
    contact_phone: ''
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [docFile, setDocFile] = useState<File | null>(null)

  // Messaging State
  const [activeChat, setActiveChat] = useState<number | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [msgInput, setMsgInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [viewingTermsFor, setViewingTermsFor] = useState<number | null>(null)
  const [signingContract, setSigningContract] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([getMyLandListings(), getIncomingLandContracts()])
      .then(([ls, rs]) => {
        setListings(ls)
        setRequests(rs)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

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

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    try {
      let created = await createLandListing({
        ...form,
        area_acres: Number(form.area_acres),
        price_per_acre_per_season: Number(form.price_per_acre_per_season),
        suitable_crops: form.suitable_crops.split(',').map(s => s.trim()).filter(Boolean)
      })

      if (photoFile || docFile) {
        const formData = new FormData()
        if (photoFile) formData.append('photo', photoFile)
        if (docFile) formData.append('documents', docFile)
        created = await uploadLandDocuments(created.id, formData)
      }

      setListings([created, ...listings])
      setSaved(true)
      setForm({
        area_acres: '', soil_type: 'Red', water_source: 'Rainfed',
        irrigation_available: false, suitable_crops: '', price_per_acre_per_season: '',
        contact_phone: ''
      })
      setPhotoFile(null)
      setDocFile(null)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const handleRespond = async (contractId: number, action: 'accept' | 'decline') => {
    try {
      const updated = await respondToLandContract(contractId, { action })
      setRequests(reqs => reqs.map(r => r.id === contractId ? updated : r))
    } catch (err) {
      console.error(err)
    }
  }

  const handleReview = async (contractId: number) => {
    const ratingStr = prompt('Enter rating (1-5) for the buyer:', '5')
    if (!ratingStr) return
    const rating = parseInt(ratingStr)
    const comment = prompt('Optional review comment:', '') || ''
    try {
      await submitReview({ contract_id: contractId, rating, comment })
      alert('✅ Review submitted!')
    } catch (e: any) {
      alert('❌ ' + (e?.response?.data?.detail || 'Failed to submit review'))
    }
  }

  const handleDispute = async (contractId: number) => {
    const reason = prompt('Enter reason for dispute:')
    if (!reason) return
    try {
      await openDispute({ contract_id: contractId, reason })
      alert('⚖️ Dispute opened. Our team will review this.')
    } catch (e: any) {
      alert('❌ ' + (e?.response?.data?.detail || 'Failed to open dispute'))
    }
  }

  if (loading) return <div className="p-8 text-center"><Spinner /></div>

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 fade-in">
      <h1 className="text-2xl font-bold text-field-900 mb-2">{t('fland.title')}</h1>
      <p className="text-field-600 mb-6">{t('fland.subtitle')}</p>

      
      {viewingTermsFor && (
        <TermsModal contractId={viewingTermsFor} onClose={() => setViewingTermsFor(null)} />
      )}
      
      {signingContract && (
        <OtpSignModal 
          contractId={signingContract} 
          role="Farmer" 
          onClose={() => setSigningContract(null)}
          onSuccess={() => {
            setSigningContract(null)
            getIncomingLandContracts().then(setRequests)
          }}
        />
      )}

      {/* Tabs */}
      <div className="flex bg-white rounded-xl shadow-sm p-1 mb-6 border border-field-100">
        {[
          { id: 'upload', label: t('fland.tab.upload') },
          { id: 'myland', label: t('fland.tab.myland') },
          { id: 'requests', label: t('fland.tab.requests') }
        ].map(tb => (
          <button
            key={tb.id}
            onClick={() => { setTab(tb.id as any); setActiveChat(null) }}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
              tab === tb.id ? 'bg-earth-100 text-earth-800' : 'text-field-500 hover:bg-field-50'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {activeChat ? (
        <Card className="flex flex-col h-[500px]">
          <div className="flex justify-between items-center mb-4 pb-4 border-b">
            <h3 className="font-bold text-lg">{t('land.chatwithbuyer')}</h3>
            <Button variant="outline" onClick={() => setActiveChat(null)}>{t('common.back')}</Button>
          </div>
          <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-2">
            {chatLoading ? <Spinner /> : messages.length === 0 ? (
              <p className="text-gray-400 text-center text-sm italic mt-10">{t('land.nomessages')}</p>
            ) : (
              messages.map(m => (
                <div key={m.id} className={`flex ${m.is_mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] p-3 rounded-2xl ${
                    m.is_mine ? 'bg-earth-600 text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none'
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
              placeholder={t('messages.typemessage')}
            />
            <Button type="submit">{t('common.send')}</Button>
          </form>
        </Card>
      ) : tab === 'upload' ? (
        <ListingWizard onComplete={() => {
          setTab('myland')
          getMyLandListings().then(setListings)
        }} />
      ) : tab === 'myland' ? (
        <div className="space-y-4">
          {listings.length === 0 ? <p className="text-center text-gray-500 py-8">{t('land.nolanduploaded')}</p> : null}
          {listings.map(l => (
            <Card key={l.id} className="flex justify-between items-center">
              <div>
                <div className="font-bold text-lg">{l.area_acres} Acres in {l.village}, {l.district}</div>
                <div className="text-sm text-gray-500">{l.suitable_crops.join(', ')} • ₹{l.price_per_acre_per_season}/acre/season</div>
              </div>
              <StatusPill status={l.status} colors={STATUS_COLORS} />
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {requests.length === 0 ? <p className="text-center text-gray-500 py-8">{t('land.norequests')}</p> : null}
          {requests.map(r => (
            <Card key={r.id}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-lg">Request from {r.buyer_name}</h3>
                  <div className="text-sm text-gray-500">
                    For {r.listing_area_acres} Acres in {r.listing_village} • Crop: {r.agreed_crop}
                  </div>
                </div>
                <StatusPill status={r.status} colors={STATUS_COLORS} />
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg mb-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div><strong>Total Offer:</strong> ₹{r.total_price}</div>
                  <div><strong>Start Date:</strong> {new Date(r.start_date).toLocaleDateString()}</div>
                </div>
              </div>

              <div className="flex gap-2">
                {r.status === 'pending' && (
                  <>
                    <Button onClick={() => handleRespond(r.id, 'accept')} className="bg-emerald-600 hover:bg-emerald-700">{t('common.accept')}</Button>
                    <Button variant="outline" onClick={() => handleRespond(r.id, 'decline')} className="text-red-600 border-red-200 hover:bg-red-50">{t('common.decline')}</Button>
                  </>
                )}
                
                <Button variant="outline" onClick={() => setViewingTermsFor(r.id)}>
                  📝 View Terms
                </Button>

                <Button variant="outline" onClick={() => handleOpenChat(r.id)}>
                  💬 Message Buyer
                </Button>
                
                {(r.status === 'ready_for_signing' || r.status === 'partially_signed') && (
                   <Button variant="outline" className="border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100" onClick={() => setSigningContract(r.id)}>
                     ✍️ Sign via OTP
                   </Button>
                )}
                
                {r.status === 'active' && r.contract_pdf_url && (
                  <Button variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100" onClick={() => window.open(`${getApiBase()}${r.contract_pdf_url}`, '_blank')}>
                    📄 View PDF Contract
                  </Button>
                )}
                {r.status === 'active' && (
                  <>
                    <Button variant="outline" className="border-yellow-200 text-yellow-700 bg-yellow-50 hover:bg-yellow-100" onClick={() => handleReview(r.id)}>
                      ⭐ Rate Buyer
                    </Button>
                    <Button variant="outline" className="border-red-200 text-red-700 bg-red-50 hover:bg-red-100" onClick={() => handleDispute(r.id)}>
                      ⚖️ Open Dispute
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    
      {/* Legal Footer */}
      <div className="mt-8 mb-4 p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500">
        <strong>⚠️ Legal Disclaimer:</strong> This platform facilitates the tracking of terms and escrow payments for land leases. It does not replace formal legal registration. For leases of 12 months or longer, or year-to-year leases, the Registration Act, 1908 requires formal registration. Both parties are advised to consult with a legal professional to ensure compliance with local laws.
      </div>
</div>
  )
}
