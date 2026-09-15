import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import { getUser } from '../services/api'
import { HarvestChat } from '../components/HarvestChat'

export default function Messages() {
  const { t } = useLanguage()
  const user = getUser()
  const [searchParams, setSearchParams] = useSearchParams()
  const [harvests, setHarvests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const activeHarvestId = searchParams.get('harvest_id') ? parseInt(searchParams.get('harvest_id') as string, 10) : null

  useEffect(() => {
    fetchThreads()
  }, [])

  const fetchThreads = async () => {
    try {
      const isBuyer = user?.role === 'buyer'
      // Farmers fetch their calendar, Buyers fetch their pre-bookings
      const endpoint = isBuyer ? '/api/harvest/prebooking/my' : '/api/harvest/calendar/my'
      
      const res = await fetch(endpoint, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })
      if (!res.ok) throw new Error('Failed to load threads')
      
      let data = await res.json()
      
      if (isBuyer) {
        // Buyers receive PreBooking objects, we need to extract the Harvests
        // Or if the backend returns just bookings without full harvest data, we construct a dummy harvest object
        // Actually, PreBooking has 'harvest' relationship in backend, assuming it's serialized.
        // Let's just fallback if it's missing.
        data = data.map((b: any) => b.harvest || { id: b.harvest_id, crop: `Harvest #${b.harvest_id}` })
      }
      
      setHarvests(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const selectHarvest = (harvestId: number) => {
    setSearchParams({ harvest_id: harvestId.toString() })
  }

  return (
    <div className="max-w-6xl mx-auto flex gap-6 h-[calc(100vh-8rem)]">
      {/* Threads List (Left Pane) */}
      <div className="w-1/3 bg-white border rounded-lg shadow-sm flex flex-col overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <h2 className="text-xl font-bold text-field-800">💬 {t('nav.messages')}</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          {loading && <p className="text-gray-500 p-2">{t('messages.loadingthreads')}</p>}
          {error && <p className="text-red-500 p-2">{error}</p>}
          {!loading && harvests.length === 0 && (
            <p className="text-gray-500 p-2 text-center mt-4">{t('messages.noactivechats')}</p>
          )}
          
          {harvests.map(harvest => (
            <button
              key={harvest.id}
              onClick={() => selectHarvest(harvest.id)}
              className={`w-full text-left p-3 rounded-lg mb-2 transition border ${
                activeHarvestId === harvest.id 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-white border-transparent hover:bg-gray-50'
              }`}
            >
              <h3 className="font-semibold text-field-800">
                {harvest.crop} {harvest.variety && `(${harvest.variety})`}
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                {harvest.status ? harvest.status.replace('_', ' ').toUpperCase() : ''}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area (Right Pane) */}
      <div className="flex-1 bg-gray-50 border rounded-lg shadow-sm flex flex-col overflow-hidden">
        {activeHarvestId ? (
          <div className="flex-1 overflow-y-auto">
             <HarvestChat harvestId={activeHarvestId} onClose={() => setSearchParams({})} />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            {t('messages.selectthread')}
          </div>
        )}
      </div>
    </div>
  )
}
