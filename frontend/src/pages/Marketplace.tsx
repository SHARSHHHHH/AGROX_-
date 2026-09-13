import { useEffect, useState } from 'react'
import { getAvailableCrops, browseListings, revealListingContact, expressInterest } from '../services/api'
import { Card, Spinner, StatusPill, Empty } from '../components/UI'
import { useLanguage } from '../contexts/LanguageContext'
import { usePageContext } from '../contexts/PageContext'

const STATUS_PILL: Record<string, string> = { growing: 'INFO', available: 'OPTIMAL' }

const CROP_ICONS: Record<string, string> = {
  soybean: '🌱', wheat: '🌾', chickpea: '🫘', maize: '🌽', cotton: '☁️',
  rice: '🍚', tomato: '🍅', onion: '🧅', potato: '🥔', chilli: '🌶️',
}

// Manure listings carry the method key (compost / vermicompost / fym /
// liquid) in `crop`, so the same icon-grid machinery groups them by type.
const MANURE_ICONS: Record<string, string> = {
  compost: '🍂', vermicompost: '🪱', fym: '🐄', liquid: '💧',
}
const MANURE_LABELS: Record<string, string> = {
  compost: 'Compost', vermicompost: 'Vermicompost',
  fym: 'Farmyard manure', liquid: 'Liquid manure',
}

// The buyer should always be able to browse farmer-made manure even before
// anyone has listed a sack of it — so these four categories are always
// shown in the grid, with a count of zero until listings exist.
const ALWAYS_SHOW_MANURE = [
  { crop: 'compost', product_type: 'fertilizer', listings: 0 },
  { crop: 'vermicompost', product_type: 'fertilizer', listings: 0 },
  { crop: 'fym', product_type: 'fertilizer', listings: 0 },
  { crop: 'liquid', product_type: 'fertilizer', listings: 0 },
]

const iconFor = (pt: string, key: string) =>
  pt === 'fertilizer' ? (MANURE_ICONS[key] || '♻️') : (CROP_ICONS[key] || '🥬')

/**
 * Buyer-facing marketplace. Buyers pick a crop or a manure type by its icon
 * rather than typing a search — tapping a box expands it to show listings
 * grouped by STATE and, within each state, by variety, with the farmer's own
 * photo where they've uploaded one.
 *
 * Crops AND farmer-made manure (compost, vermicompost, farmyard manure and
 * liquid manure) share this single grid: a buyer looking for tomatoes is
 * often also in the market for manure, so manure-type boxes sit alongside
 * the produce boxes on the same tab.
 */
export default function Marketplace() {
  const { tv } = useLanguage()
  const { publish } = usePageContext()
  const [boxes, setBoxes] = useState<any[] | null>(null)
  const [openBox, setOpenBox] = useState<any | null>(null)
  const [listings, setListings] = useState<any[]>([])
  const [loadingListings, setLoadingListings] = useState(false)
  const [contact, setContact] = useState<any>(null)
  const [interested, setInterested] = useState<Record<number, boolean>>({})
  const [qty, setQty] = useState<Record<number, string>>({})
  const [showSearch, setShowSearch] = useState(false)
  const [filters, setFilters] = useState({ crop: '', state: '', district: '', max_price: '' })
  const [searchResults, setSearchResults] = useState<any[] | null>(null)

  const labelFor = (pt: string, key: string) =>
    pt === 'fertilizer' ? (MANURE_LABELS[key] || key) : tv(key)

  useEffect(() => {
    setBoxes(null)
    setOpenBox(null)
    setListings([])
    getAvailableCrops('all').then((cs) => {
      const merged = [...cs]
      for (const m of ALWAYS_SHOW_MANURE) {
        if (!merged.some((b: any) =>
            b.crop === m.crop && b.product_type === m.product_type)) {
          merged.push(m)
        }
      }
      merged.sort((a: any, b: any) => b.listings - a.listings)
      setBoxes(merged)
      const crops = merged.filter((c: any) => c.product_type !== 'fertilizer')
      const manure = merged.filter((c: any) => c.product_type === 'fertilizer')
      publish('Marketplace', [
        crops.length ? `Crops available: ${crops.map((c: any) => `${c.crop} (${c.listings})`).join(', ')}.` : '',
        manure.length ? `Manure available: ${manure.map((c: any) => `${MANURE_LABELS[c.crop] || c.crop} (${c.listings})`).join(', ')}.` : '',
      ].filter(Boolean).join(' ') || 'No crops or manure currently listed for sale.')
    }).catch(() => setBoxes([]))
  }, []) // eslint-disable-line

  const openBoxPanel = async (box: any) => {
    if (openBox?.crop === box.crop && openBox?.product_type === box.product_type) { setOpenBox(null); return }
    setOpenBox(box)
    setLoadingListings(true)
    try {
      const res = await browseListings({ crop: box.crop, product_type: box.product_type })
      setListings(res)
    } finally {
      setLoadingListings(false)
    }
  }

  const doContact = async (id: number) => {
    const res = await revealListingContact(id)
    setContact({ id, ...res })
  }
  const doInterest = async (id: number) => {
    await expressInterest(id, { quantity_kg: qty[id] ? Number(qty[id]) : null })
    setInterested((m) => ({ ...m, [id]: true }))
  }

  const runSearch = () => {
    const params: any = { product_type: 'all' }
    if (filters.crop) params.crop = filters.crop
    if (filters.state) params.state = filters.state
    if (filters.district) params.district = filters.district
    if (filters.max_price) params.max_price = Number(filters.max_price)
    browseListings(params).then(setSearchResults).catch(() => setSearchResults([]))
  }

  // Group the open box's listings by state, then by variety within state —
  // this is the "same crop, different states, different types" view.
  const byState: Record<string, Record<string, any[]>> = {}
  for (const l of listings) {
    const state = l.state || 'Unknown state'
    const variety = l.variety || 'Unspecified'
    byState[state] = byState[state] || {}
    byState[state][variety] = byState[state][variety] || []
    byState[state][variety].push(l)
  }

  const ListingCard = ({ l }: { l: any }) => {
    const fert = l.product_type === 'fertilizer'
    const title = fert ? (l.product_name || MANURE_LABELS[l.crop] || l.crop)
                       : tv(l.crop)
    return (
    <Card className="!p-3">
      <div className="flex gap-3">
        {l.image_url ? (
          <img src={l.image_url} alt={title} className="w-16 h-16 object-cover rounded-lg border shrink-0" />
        ) : (
          <div className="w-16 h-16 rounded-lg border bg-gray-50 flex items-center justify-center text-2xl shrink-0">
            {fert ? (MANURE_ICONS[l.crop] || '♻️') : (CROP_ICONS[l.crop] || '🥬')}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="font-semibold text-sm text-field-800 truncate">
              {title}
              {fert
                ? <span className="text-gray-400 font-normal"> · {MANURE_LABELS[l.crop] || l.crop}</span>
                : l.variety && <span className="text-gray-400 font-normal"> · {l.variety}</span>}
            </div>
            <StatusPill status={STATUS_PILL[l.status] || 'INFO'} />
          </div>
          {/* The farmer's name is the point of a direct marketplace — a buyer
              is buying from a person, not from a warehouse. */}
          <div className="text-xs text-gray-500">{l.district || l.state} · Farmer: {l.farmer_name}</div>
          <div className="text-sm mt-0.5">
            {l.quantity_kg && <span>📦 {l.quantity_kg} kg</span>}
            {l.price_per_kg && <span className="font-bold text-field-700"> · ₹{l.price_per_kg}/kg</span>}
          </div>
          {l.predicted_maturity_date && (
            <div className="text-xs text-gray-400">
              {l.status === 'available' ? 'Ready now' : `Ready ~${l.predicted_maturity_date}`}
            </div>
          )}
          {!l.predicted_maturity_date && fert && l.status === 'available' && (
            <div className="text-xs text-gray-400">Ready now</div>
          )}
        </div>
      </div>

      <div className="mt-2 flex gap-2">
        <input type="number" min="0" placeholder="kg needed"
          value={qty[l.id] || ''}
          onChange={(e) => setQty((m) => ({ ...m, [l.id]: e.target.value }))}
          className="flex-1 border rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-field-600" />
        <button onClick={() => doInterest(l.id)} disabled={!!interested[l.id]}
          className="text-xs font-semibold bg-field-600 text-white px-2.5 py-1.5 rounded-lg disabled:opacity-50">
          {interested[l.id] ? '✓ Sent' : "I'm interested"}
        </button>
      </div>
      <button onClick={() => doContact(l.id)}
        className="mt-1.5 text-xs font-semibold bg-white border w-full py-1.5 rounded-lg hover:bg-gray-50">
        📞 Show farmer's contact
      </button>
      {contact?.id === l.id && (
        <div className="mt-2 bg-field-50 rounded-lg p-2 text-xs">
          <div className="font-semibold">{contact.farmer_name}</div>
          <div>{contact.contact_phone}</div>
          <p className="text-gray-500 mt-1">{contact.safety_note}</p>
        </div>
      )}
    </Card>
    )
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-field-800 mb-1">🛒 Marketplace</h1>
      <p className="text-sm text-gray-500 mb-4">
        Tap a crop or a manure type to see what farmers have listed, in which
        states and at which price — no mandi trip, no middleman.
      </p>

      {boxes === null ? <Spinner /> : boxes.length === 0 ? (
        <Card><Empty msg="No crops or manure are listed for sale right now — check back soon." /></Card>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 mb-6">
          {boxes.map((b: any) => {
            const isManure = b.product_type === 'fertilizer'
            return (
            <button key={`${b.product_type}-${b.crop}`}
              onClick={() => openBoxPanel(b)}
              className={`aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-1 transition
                ${openBox?.crop === b.crop && openBox?.product_type === b.product_type
                  ? 'border-field-600 bg-field-50'
                  : isManure ? 'border-green-300 bg-green-50/60 hover:border-green-500'
                             : 'border-gray-200 bg-white hover:border-field-300'}`}>
              <span className="text-3xl">{iconFor(b.product_type, b.crop)}</span>
              <span className="text-xs font-semibold text-field-800 capitalize text-center px-1">
                {labelFor(b.product_type, b.crop)}
              </span>
              <span className="text-[10px] text-gray-400">
                {b.listings} listing(s){isManure ? ' · ♻️ farmer-made' : ''}
              </span>
            </button>
            )
          })}
        </div>
      )}

      {openBox && (
        <Card className="mb-6">
          <h3 className="font-semibold text-field-800 mb-3">
            {iconFor(openBox.product_type, openBox.crop)} {labelFor(openBox.product_type, openBox.crop)}
            {' '}— available by state
          </h3>
          {loadingListings ? <Spinner /> : Object.keys(byState).length === 0 ? (
            <Empty msg="No current listings for this crop." />
          ) : (
            <div className="space-y-5">
              {Object.entries(byState).map(([state, varieties]) => (
                <div key={state}>
                  <div className="text-sm font-semibold text-gray-600 mb-2">📍 {state}</div>
                  {Object.entries(varieties).map(([variety, items]) => (
                    <div key={variety} className="mb-3">
                      <div className="text-xs text-gray-400 mb-1.5 pl-1">Type: {variety}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {items.map((l) => <ListingCard key={l.id} l={l} />)}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Optional broader search, for a buyer who wants to filter across
          crops/states/price rather than browse box-by-box. */}
      <button onClick={() => setShowSearch(!showSearch)}
        className="text-xs text-field-600 font-semibold underline underline-offset-2 mb-3">
        {showSearch ? 'Hide' : 'Or search all listings by filters'}
      </button>
      {showSearch && (
        <Card>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <input placeholder="Item (crop or manure type)" value={filters.crop}
              onChange={(e) => setFilters({ ...filters, crop: e.target.value })}
              className="border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-field-600" />
            <input placeholder="State" value={filters.state}
              onChange={(e) => setFilters({ ...filters, state: e.target.value })}
              className="border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-field-600" />
            <input placeholder="District" value={filters.district}
              onChange={(e) => setFilters({ ...filters, district: e.target.value })}
              className="border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-field-600" />
            <input placeholder="Max ₹/kg" type="number" value={filters.max_price}
              onChange={(e) => setFilters({ ...filters, max_price: e.target.value })}
              className="border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-field-600" />
          </div>
          <button onClick={runSearch}
            className="mt-3 text-xs font-semibold bg-field-600 text-white px-4 py-2 rounded-xl">
            Search
          </button>
          {searchResults !== null && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
              {searchResults.length === 0 ? <Empty msg="No listings match those filters." /> :
                searchResults.map((l) => <ListingCard key={l.id} l={l} />)}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}