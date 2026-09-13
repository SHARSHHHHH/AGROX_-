import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import { getHarvestMessageNotifications, markNotificationRead, getFarmProfile } from '../services/api'

export default function HarvestCalendar() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [harvests, setHarvests] = useState([])
  const [bookings, setBookings] = useState([])

  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [farmProfile, setFarmProfile] = useState<any>(null)
  const [formData, setFormData] = useState({
    crop: '',
    variety: '',
    sowing_date: '',
    expected_harvest_date: '',
    estimated_quantity_kg: '',
    expected_min_price: '',
    expected_max_price: '',
    plot_size_acres: '1.0',
    soil_type: '',
    irrigation_type: '',
    notes: ''
  })

  useEffect(() => {
    fetchHarvests()
    getFarmProfile().then(setFarmProfile).catch(() => {})
  }, [])

  useEffect(() => {
    const loadNotifications = () => getHarvestMessageNotifications().then(setNotifications).catch(() => {})
    loadNotifications()
    const timer = window.setInterval(loadNotifications, 10000)
    return () => window.clearInterval(timer)
  }, [])

  const fetchHarvests = async () => {
    try {
      const headers = {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
      const [harvestResponse, bookingResponse] = await Promise.all([
        fetch('/api/harvest/calendar/my', { headers }),
        fetch('/api/harvest/prebooking/farmer/my', { headers })
      ])
      if (!harvestResponse.ok || !bookingResponse.ok) throw new Error('Failed to load harvests or buyer requests')
      const data = await harvestResponse.json()
      setHarvests(data)
      setBookings(await bookingResponse.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const respondToBooking = async (bookingId, status) => {
    try {
      const response = await fetch(`/api/harvest/prebooking/${bookingId}/respond`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status, farmer_response: status === 'confirmed' ? 'Request confirmed.' : 'Request declined.' })
      })
      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.detail || 'Failed to update request')
      }
      await fetchHarvests()
    } catch (err) {
      setError(err.message)
    }
  }

  const openChat = async (harvestId) => {
    navigate('/messages')
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => {
      const newData = { ...prev, [name]: value }
      if (name === 'crop' && farmProfile?.current_crop?.growing) {
        const farmCrop = farmProfile.current_crop.display || farmProfile.current_crop.crop
        if (farmCrop && value.toLowerCase() === farmCrop.toLowerCase()) {
          if (farmProfile.current_crop.sowing_date?.value) {
            newData.sowing_date = farmProfile.current_crop.sowing_date.value
          }
          if (farmProfile.current_crop.expected_harvest_date?.value) {
            newData.expected_harvest_date = farmProfile.current_crop.expected_harvest_date.value
          }
          if (farmProfile.land?.area_acres?.value) {
            newData.plot_size_acres = farmProfile.land.area_acres.value.toString()
          }
        }
      }
      return newData
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const response = await fetch('/api/harvest/calendar', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          estimated_quantity_kg: formData.estimated_quantity_kg ? parseFloat(formData.estimated_quantity_kg) : null,
          expected_min_price: formData.expected_min_price ? parseFloat(formData.expected_min_price) : null,
          expected_max_price: formData.expected_max_price ? parseFloat(formData.expected_max_price) : null,
          plot_size_acres: parseFloat(formData.plot_size_acres) || 1.0
        })
      })
      if (!response.ok) throw new Error('Failed to create harvest')
      setFormData({
        crop: '',
        variety: '',
        sowing_date: '',
        expected_harvest_date: '',
        estimated_quantity_kg: '',
        expected_min_price: '',
        expected_max_price: '',
        plot_size_acres: '1.0',
        soil_type: '',
        irrigation_type: '',
        notes: ''
      })
      setShowForm(false)
      fetchHarvests()
    } catch (err) {
      setError(err.message)
    }
  }

  const getStatusColor = (status) => {
    const colors = {
      'planning': 'bg-blue-100 text-blue-800',
      'growing': 'bg-green-100 text-green-800',
      'ready_for_harvest': 'bg-yellow-100 text-yellow-800',
      'harvested': 'bg-gray-100 text-gray-800',
      'cancelled': 'bg-red-100 text-red-800'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  if (loading) return <div className="p-4">{t('common.loading')}</div>

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">🌾 {t('harvest.title')}</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
        >
          {showForm ? t('harvest.cancel') : `+ ${t('harvest.plan')}`}
        </button>
      </div>

      {notifications.length > 0 && (
        <section className="bg-amber-50 border border-amber-200 p-4 rounded-lg mb-6">
          <h2 className="font-bold mb-2">🔔 New Buyer Messages ({notifications.length})</h2>
          <div className="space-y-2">
            {notifications.map(notification => (
              <button key={notification.id} type="button" onClick={() => { markNotificationRead(notification.id).catch(() => {}); openChat(notification.harvest_id) }} className="block w-full text-left bg-white rounded p-2 hover:bg-amber-100">
                <span className="font-semibold">{notification.sender_name}</span> on {notification.crop}: {notification.content}
              </button>
            ))}
          </div>
        </section>
      )}

      {error && <div className="bg-red-100 text-red-800 p-3 rounded mb-4">{error}</div>}

      <section className="bg-white p-4 rounded-lg shadow mb-6">
        <h2 className="text-xl font-bold mb-4">{t('harvest.buyerRequests')} ({bookings.length})</h2>
        {bookings.length === 0 ? (
          <p className="text-gray-600">{t('harvest.noRequests')}</p>
        ) : (
          <div className="space-y-3">
            {bookings.map(booking => (
              <div key={booking.id} className="border rounded p-3">
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <p className="font-semibold">{booking.crop} {booking.variety && `(${booking.variety})`}</p>
                    <p className="text-sm text-gray-600">{booking.quantity_kg || 'Any'} kg at ₹{booking.agreed_price_per_kg || 'negotiable'} / kg</p>
                    <p className="text-sm text-gray-600">Delivery: {booking.delivery_location || 'Not specified'}</p>
                    {booking.buyer_message && <p className="text-sm mt-2">“{booking.buyer_message}”</p>}
                  </div>
                  <span className={`px-3 py-1 rounded text-sm font-semibold ${getStatusColor(booking.status)}`}>
                    {booking.status.toUpperCase()}
                  </span>
                </div>
                {booking.status === 'requested' && (
                  <div className="flex gap-2 mt-3">
                    <button type="button" onClick={() => respondToBooking(booking.id, 'confirmed')} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded">{t('harvest.confirm')}</button>
                    <button type="button" onClick={() => respondToBooking(booking.id, 'declined')} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded">{t('harvest.decline')}</button>
                  </div>
                )}
                <button type="button" onClick={() => openChat(booking.harvest_id)} className="mt-3 text-green-700 font-semibold">💬 {t('harvest.messageBuyer')}</button>
              </div>
            ))}
          </div>
        )}
      </section>


      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-2">Crop *</label>
              <input
                type="text"
                name="crop"
                value={formData.crop}
                onChange={handleInputChange}
                required
                className="w-full border rounded p-2"
                placeholder="e.g., Tomato"
              />
            </div>
            <div>
              <label className="block font-semibold mb-2">{t('harvest.variety')}</label>
              <input
                type="text"
                name="variety"
                value={formData.variety}
                onChange={handleInputChange}
                className="w-full border rounded p-2"
                placeholder="e.g., Roma"
              />
            </div>
            <div>
              <label className="block font-semibold mb-2">{t('harvest.sowingdate')}</label>
              <input
                type="date"
                name="sowing_date"
                value={formData.sowing_date}
                onChange={handleInputChange}
                className="w-full border rounded p-2"
              />
            </div>
            <div>
              <label className="block font-semibold mb-2">{t('harvest.expectedharvestdate')}</label>
              <input
                type="date"
                name="expected_harvest_date"
                value={formData.expected_harvest_date}
                onChange={handleInputChange}
                required
                className="w-full border rounded p-2"
              />
            </div>
            <div>
              <label className="block font-semibold mb-2">{t('harvest.estimatedqty')}</label>
              <input
                type="number"
                name="estimated_quantity_kg"
                value={formData.estimated_quantity_kg}
                onChange={handleInputChange}
                step="0.1"
                className="w-full border rounded p-2"
              />
            </div>
            <div>
              <label className="block font-semibold mb-2">{t('harvest.plotsize')}</label>
              <input
                type="number"
                name="plot_size_acres"
                value={formData.plot_size_acres}
                onChange={handleInputChange}
                step="0.1"
                className="w-full border rounded p-2"
              />
            </div>
            <div>
              <label className="block font-semibold mb-2">Min Price per kg (₹)</label>
              <input
                type="number"
                name="expected_min_price"
                value={formData.expected_min_price}
                onChange={handleInputChange}
                step="0.01"
                className="w-full border rounded p-2"
              />
            </div>
            <div>
              <label className="block font-semibold mb-2">Max Price per kg (₹)</label>
              <input
                type="number"
                name="expected_max_price"
                value={formData.expected_max_price}
                onChange={handleInputChange}
                step="0.01"
                className="w-full border rounded p-2"
              />
            </div>
            <div>
              <label className="block font-semibold mb-2">{t('ob.s2.soiltype')}</label>
              <input
                type="text"
                name="soil_type"
                value={formData.soil_type}
                onChange={handleInputChange}
                className="w-full border rounded p-2"
                placeholder="e.g., Loamy"
              />
            </div>
            <div>
              <label className="block font-semibold mb-2">{t('ob.s2.irrigation')}</label>
              <input
                type="text"
                name="irrigation_type"
                value={formData.irrigation_type}
                onChange={handleInputChange}
                className="w-full border rounded p-2"
                placeholder="e.g., Drip"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block font-semibold mb-2">{t('harvest.notes')}</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              className="w-full border rounded p-2"
              rows={3}
              placeholder={t('harvest.notesplaceholder')}
            />
          </div>
          <button
            type="submit"
            className="mt-4 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded"
          >
            {t('harvest.saveplan')}
          </button>
        </form>
      )}

      {harvests.length === 0 ? (
        <div className="bg-gray-100 p-6 rounded text-center">
          <p className="text-gray-600">{t('harvest.noplans')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {harvests.map(harvest => (
            <div key={harvest.id} className="bg-white p-4 rounded-lg shadow">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-xl font-bold">{harvest.crop} {harvest.variety && `(${harvest.variety})`}</h3>
                  <p className="text-gray-600 text-sm">Plot: {harvest.plot_size_acres} acres</p>
                </div>
                <span className={`px-3 py-1 rounded text-sm font-semibold ${getStatusColor(harvest.status)}`}>
                  {harvest.status.replace('_', ' ').toUpperCase()}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                {harvest.sowing_date && (
                  <div>
                    <p className="text-gray-500">{t('harvest.sowingdate')}</p>
                    <p className="font-semibold">{new Date(harvest.sowing_date).toLocaleDateString()}</p>
                  </div>
                )}
                <div>
                  <p className="text-gray-500">{t('harvest.expectedharvest')}</p>
                  <p className="font-semibold">{new Date(harvest.expected_harvest_date).toLocaleDateString()}</p>
                </div>
                {harvest.estimated_quantity_kg && (
                  <div>
                    <p className="text-gray-500">{t('harvest.estimatedqtyshort')}</p>
                    <p className="font-semibold">{harvest.estimated_quantity_kg.toLocaleString()} kg</p>
                  </div>
                )}
                {harvest.expected_min_price && (
                  <div>
                    <p className="text-gray-500">{t('harvest.expectedprice')}</p>
                    <p className="font-semibold">₹{harvest.expected_min_price} - ₹{harvest.expected_max_price}</p>
                  </div>
                )}
              </div>
              {harvest.notes && (
                <p className="text-gray-700 mt-3 pt-3 border-t">{harvest.notes}</p>
              )}
              <div className="mt-4 flex gap-3">
                <button type="button" onClick={() => navigate(`/messages?harvest_id=${harvest.id}`)} className="text-green-700 font-semibold px-4 py-2 border border-green-200 rounded hover:bg-green-50">
                  💬 {t('harvest.messages')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
