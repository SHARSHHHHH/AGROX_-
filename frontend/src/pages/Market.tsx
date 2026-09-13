import { useEffect, useRef, useState } from 'react'
import {
  calculateROI, getCropList, getOffers,
  getMandiSummary, getMyMandiPrice, getUser, getOnboardingStatus,
} from '../services/api'
import { Card, Button, Spinner } from '../components/UI'
import { useLanguage } from '../contexts/LanguageContext'
import { usePageContext } from '../contexts/PageContext'

/**
 * Status badge. The whole point of the market/fertilizer services is that they
 * never invent a number, so the UI must show WHICH kind of data the farmer is
 * looking at. A mock price rendered like a real one would defeat the backend
 * guarantee entirely.
 */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    ok: { cls: 'bg-green-100 text-green-800 border-green-300', label: 'LIVE GOVT DATA' },
    empty: { cls: 'bg-gray-100 text-gray-600 border-gray-300', label: 'NO ARRIVALS' },
    not_configured: { cls: 'bg-red-100 text-red-700 border-red-300', label: 'NOT CONFIGURED' },
    reference: { cls: 'bg-blue-100 text-blue-800 border-blue-300', label: 'OFFICIAL MRP' },
    timeout: { cls: 'bg-orange-100 text-orange-800 border-orange-300', label: 'TIMED OUT' },
    unavailable: { cls: 'bg-gray-200 text-gray-600 border-gray-300', label: 'NO DATA' },
    // Deliberately loud and impossible-to-miss — never the same styling as
    // a real price (see app/services/demo_mandi.py's honesty contract).
    demo: { cls: 'bg-purple-100 text-purple-800 border-purple-400 animate-pulse', label: '🎭 SIMULATED DEMO' },
  }
  const s = map[status] || map.unavailable
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${s.cls}`}>
      {s.label}
    </span>
  )
}

export default function Market() {
  const { t, tv } = useLanguage()
  const { publish } = usePageContext()
  const [tab, setTab] = useState<'prices' | 'roi'>('prices')

  // --- prices ---
  const [crops, setCrops] = useState<any[]>([])
  const [crop, setCrop] = useState('soybean')
  const [price, setPrice] = useState<any>(null)
  const [myPrice, setMyPrice] = useState<any>(null)
  const [mrpRef, setMrpRef] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [stateFilter, setStateFilter] = useState('')
  const [fellBackNationwide, setFellBackNationwide] = useState(false)

  // --- roi ---
  const [roiForm, setRoiForm] = useState({
    offer_price: '', standard_price: '', bags: '20',
    distance_km: '12', crop: 'soybean', acres: '2', product: 'DAP',
  })
  const [roi, setRoi] = useState<any>(null)
  const [roiBusy, setRoiBusy] = useState(false)
  const [roiElapsed, setRoiElapsed] = useState(0)
  const [roiErr, setRoiErr] = useState('')
  // Tracks exactly which inputs the currently-shown `roi` result was
  // calculated from. Without this, changing a field after calculating
  // leaves the old result sitting on screen looking like it belongs to the
  // NEW values — e.g. switching Product from DAP to Urea kept showing an
  // "MRP for DAP" verdict, because nothing told the Result panel its
  // answer was now stale. The moment any field drifts from what was
  // actually submitted, the result is cleared instead of lying.
  const lastSubmittedForm = useRef<typeof roiForm | null>(null)
  // Always holds the LATEST form values, even while a calculation is still
  // in flight — used to detect edits made mid-request (see runROI below).
  const roiFormRef = useRef(roiForm)
  roiFormRef.current = roiForm
  // Live reference price for whatever crop is picked in the ROI form —
  // shown right next to the offer/standard-price fields so the farmer has
  // a real number to compare against BEFORE they hit calculate, not only
  // after. Fetched fresh every time the crop selection changes.
  const [roiCropPrice, setRoiCropPrice] = useState<any>(null)
  const [roiCropPriceLoading, setRoiCropPriceLoading] = useState(false)
  const roiPriceReqId = useRef(0)

  useEffect(() => {
    getCropList().then(setCrops).catch(() => {})
    getMyMandiPrice().then(setMyPrice).catch(() => {})
    getOffers().then((res) => {
      setMrpRef(res)
      // The ROI form defaults to the short key "DAP" before this loads;
      // once the real reference rows arrive, snap it to the exact product
      // string so the <select> actually shows it selected instead of
      // falling back to whichever option happens to render first.
      const match = res?.reference?.find((r: any) => r.product.toLowerCase().startsWith('dap'))
      if (match) setRoiForm((f) => (f.product === 'DAP' ? { ...f, product: match.product } : f))
      publish('Market & Offers', res?.reference?.length
        ? `Government MRP reference (${res.status}): `
          + res.reference.map((r: any) => `${r.product}: ₹${r.mrp}/${r.bag_kg}kg bag (${r.scheme}, effective ${r.effective})`).join('; ')
        : `No government MRP reference available (${res?.status || 'unavailable'}).`)
    }).catch(() => {})

    // Prefill the state to check with the farmer's own saved state — this
    // used to be hardcoded to "Madhya Pradesh" for every farmer regardless
    // of where they actually are, which is the main reason "check price"
    // looked broken for anyone else: real government mandi data is reported
    // per state, so querying the wrong state routinely comes back empty.
    const u = getUser()
    if (u?.state) { setStateFilter(u.state); return }
    getOnboardingStatus().then((s) => {
      if (s?.farm?.state) setStateFilter(s.farm.state)
    }).catch(() => {})
  }, [])

  const lookup = async () => {
    setBusy(true); setPrice(null); setFellBackNationwide(false)
    try {
      let res = await getMandiSummary(crop, stateFilter)
      // AGMARKNET reporting is patchy day to day — not every state reports
      // every crop every day. Rather than dead-ending on "empty" for a
      // state-scoped query, fall back to a nationwide query so the farmer
      // still gets a real, current price, clearly labelled as nationwide
      // rather than silently swapped in.
      let fellBack = false
      if (res?.status === 'empty' && stateFilter) {
        const nationwide = await getMandiSummary(crop, '')
        if (nationwide?.status === 'ok') {
          res = nationwide
          fellBack = true
          setFellBackNationwide(true)
        }
      }
      setPrice(res)
      publish('Market & Offers', res?.status === 'ok'
        ? `Checked price for ${crop}${stateFilter ? ` in ${stateFilter}` : ''}: `
          + `₹${res.best_market.modal_price}/quintal at ${res.best_market.market || res.best_market.name || 'the reporting market'}, `
          + `as of ${res.latest_date}.` + (fellBack ? ' (No state data — showing nationwide price instead.)' : '')
        : res?.status === 'demo'
        ? `Checked price for ${crop}${stateFilter ? ` in ${stateFilter}` : ''} — the real government `
          + `feed was unavailable, so a SIMULATED demo price is shown instead: `
          + `₹${res.best_market.modal_price}/quintal. This is NOT a real price — make that clear if asked.`
        : `Checked price for ${crop}${stateFilter ? ` in ${stateFilter}` : ''} — `
          + `${res?.status === 'empty' ? 'no recent arrivals reported' : res?.status === 'timeout' ? 'the live feed timed out' : 'data unavailable'}.`)
    } catch { /* handled below */ }
    finally { setBusy(false) }
  }

  // Live crop-price hint for the ROI tab: refetches whenever the selected
  // crop changes, so by the time the farmer types an offer price they
  // already have today's real mandi price sitting right next to the field
  // to judge it against — not just after they press Calculate.
  useEffect(() => {
    if (tab !== 'roi' || !roiForm.crop) { return }
    const myReqId = ++roiPriceReqId.current
    setRoiCropPriceLoading(true)
    const timer = setTimeout(() => {
      getMandiSummary(roiForm.crop, stateFilter).then((res) => {
        if (roiPriceReqId.current === myReqId) setRoiCropPrice(res)
      }).catch(() => {
        if (roiPriceReqId.current === myReqId) setRoiCropPrice(null)
      }).finally(() => {
        if (roiPriceReqId.current === myReqId) setRoiCropPriceLoading(false)
      })
    }, 350) // debounce — avoid firing on every keystroke-driven re-render
    return () => clearTimeout(timer)
  }, [tab, roiForm.crop, stateFilter])

  // The moment any field changes from what the shown `roi` result was
  // actually calculated with, drop that result — a stale answer sitting
  // next to new, uncalculated inputs is worse than a blank panel asking
  // for another click.
  useEffect(() => {
    if (lastSubmittedForm.current &&
        JSON.stringify(lastSubmittedForm.current) !== JSON.stringify(roiForm)) {
      setRoi(null)
      lastSubmittedForm.current = null
    }
    // Any edit invalidates a previous missing-field warning too.
    setRoiErr('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roiForm])

  const roiCanCalculate =
    String(roiForm.offer_price).trim() !== '' &&
    String(roiForm.bags).trim() !== ''

  const runROI = async () => {
    // Never calculate on an empty form: offer price and number of bags are
    // both required, and calling the API without them produces nonsense
    // instead of an honest "fill this in first".
    if (!roiCanCalculate) {
      setRoi(null)
      lastSubmittedForm.current = null
      setRoiErr('Enter both the offer price (₹) and the number of bags to check this offer.')
      return
    }
    setRoiBusy(true); setRoi(null); setRoiErr(''); setRoiElapsed(0)
    lastSubmittedForm.current = null
    const submittedForm = { ...roiForm }
    const startedAt = Date.now()
    const ticker = setInterval(() => setRoiElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000)
    try {
      const res = await calculateROI({
        offer_price: Number(submittedForm.offer_price),
        standard_price: Number(submittedForm.standard_price),
        bags: Number(submittedForm.bags),
        distance_km: Number(submittedForm.distance_km),
        crop: submittedForm.crop,
        acres: Number(submittedForm.acres),
        product: submittedForm.product,
      })
      // If the farmer edited a field WHILE this request was in flight, the
      // form on screen no longer matches what was just calculated — show
      // nothing rather than an answer for inputs that aren't there anymore.
      // (They'll get a fresh, correct result the next time they press
      // Calculate, or immediately if they already have — see the roiForm
      // watcher effect above.)
      if (JSON.stringify(submittedForm) !== JSON.stringify(roiFormRef.current)) {
        return
      }
      setRoi(res)
      lastSubmittedForm.current = submittedForm
      publish('Market & Offers', `Checked whether a fertilizer offer is worth it: `
        + `offer ₹${submittedForm.offer_price}/bag vs normal ₹${submittedForm.standard_price}/bag, `
        + `${submittedForm.bags} bag(s), ${submittedForm.distance_km} km away, product ${submittedForm.product}. `
        + `Verdict: ${res.worth_it ? 'worth it' : 'not worth it'} — ${res.verdict} `
        + `Net: ₹${res.profit}. Break-even distance: ${res.break_even_distance_km} km.`
        + (res.mrp_flag ? ` MRP check: ${res.mrp_flag}` : ''))
    } catch (e: any) {
      setRoiErr(e?.response?.data?.detail || 'Could not calculate this right now — please try again.')
    }
    finally { clearInterval(ticker); setRoiBusy(false) }
  }

  const useMrpRow = (r: any) => {
    setRoiForm({
      ...roiForm,
      standard_price: String(r.mrp),
      product: r.product,
    })
    setTab('roi')
  }

  const roiField = (key: keyof typeof roiForm, label: string, placeholder?: string) => (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 mb-1">{label}</label>
      <input
        value={roiForm[key]}
        placeholder={placeholder}
        onChange={(e) => setRoiForm({ ...roiForm, [key]: e.target.value })}
        className="w-full border rounded-lg px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-field-600"
      />
    </div>
  )

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-field-800 mb-1">💰 {t('market.title')}</h1>
      <p className="text-sm text-gray-500 mb-4">
        {t('market.subtitle')}
      </p>

      <div className="flex gap-2 mb-5">
        {(['prices', 'roi'] as const).map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition
              ${tab === tb ? 'bg-field-600 text-white shadow' : 'bg-white hover:bg-field-50 border'}`}
          >
            {tb === 'prices' ? 'Crop prices' : 'Is this offer worth it?'}
          </button>
        ))}
      </div>

      {/* ---------------- PRICES ---------------- */}
      {tab === 'prices' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card>
            <h3 className="font-semibold text-field-800 mb-3">{t('market.check')}</h3>
            <div className="flex gap-2 mb-2">
              <select
                value={crop}
                onChange={(e) => setCrop(e.target.value)}
                className="flex-1 border rounded-lg px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-field-600"
              >
                {crops.map((c) => (
                  <option key={c.key} value={c.key}>{tv(c.display)}</option>
                ))}
              </select>
              <Button onClick={lookup} disabled={busy}>
                {busy ? '…' : 'Check'}
              </Button>
            </div>
            <input
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              placeholder={t('common.state')}
              className="w-full border rounded-lg px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-field-600"
            />

            {fellBackNationwide && (
              <p className="text-[11px] text-amber-800 bg-amber-50 rounded-lg p-2 mt-2">
                {t('mandi.nationwide')}
              </p>
            )}

            {price && (
              <div className="mt-4 border rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-field-800 capitalize">{tv(price.crop)}</span>
                  <StatusBadge status={price.status} />
                </div>

                {(price.status === 'ok' || price.status === 'demo') ? (
                  <>
                    {price.status === 'demo' && (
                      <div className="mb-2 bg-purple-50 border border-purple-300 rounded-lg p-2">
                        <p className="text-xs font-bold text-purple-800">🎭 Simulated demo data</p>
                        <p className="text-[11px] text-purple-700 mt-0.5">{price.demo_notice}</p>
                      </div>
                    )}
                    <div className="text-2xl font-bold text-field-800">
                      ₹{price.best_market.modal_price.toLocaleString()}
                      <span className="text-sm font-normal text-gray-500">
                        {' '}{t('mandi.perquintal')}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      🏆 {t('mandi.best')}: <b>{price.best_market.market}</b>,{' '}
                      {price.best_market.district}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {t('mandi.range')} ₹{price.modal_min.toLocaleString()}–
                      ₹{price.modal_max.toLocaleString()} ·{' '}
                      {price.markets_reporting} {t('mandi.markets')}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-1">
                      {t('mandi.date')} {price.latest_date}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2 border-t pt-2">
                      {price.disclaimer}
                    </p>
                    {price.sample_key_notice && (
                      <p className="text-[11px] text-amber-800 bg-amber-50 rounded-lg p-2 mt-2">
                        ⚠ {price.sample_key_notice}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-600">
                    {price.status === 'empty' ? t('mandi.none')
                      : price.message || t('mandi.unavailable')}
                  </p>
                )}

                {price.warning && (
                  <p className="text-[11px] text-amber-800 bg-amber-50 rounded-lg p-2 mt-2">
                    {price.warning}
                  </p>
                )}
                {price.advice && (
                  <p className="text-[11px] text-gray-500 mt-2">{price.advice}</p>
                )}
              </div>
            )}

            {myPrice && (
              <div className="mt-4 border-t pt-3">
                <p className="text-[11px] font-semibold text-gray-500 uppercase mb-1">
                  {t('market.yourcrop')}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-sm capitalize">{myPrice.crop || '—'}</span>
                  <StatusBadge status={myPrice.status} />
                </div>
                {myPrice.status !== 'ok' && myPrice.status !== 'demo' && myPrice.message && (
                  <p className="text-xs text-gray-500 mt-1">{myPrice.message}</p>
                )}
                {myPrice.status === 'demo' && (
                  <p className="text-[11px] text-purple-700 mt-1">🎭 {myPrice.demo_notice}</p>
                )}
              </div>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-field-800">Government fertilizer MRP</h3>
              {mrpRef && <StatusBadge status={mrpRef.status} />}
            </div>
            <p className="text-[11px] text-gray-400 mb-3">
              Regulated ceiling prices, not live vendor deals — no dealer may lawfully charge more.
            </p>

            {!mrpRef && <Spinner />}
            {mrpRef?.reference?.length === 0 && (
              <p className="text-sm text-gray-500">{mrpRef.message}</p>
            )}

            <div className="space-y-2">
              {mrpRef?.reference?.map((r: any) => (
                <div key={r.product} className="border rounded-xl p-3">
                  <div className="font-semibold text-sm text-field-800">{r.product}</div>
                  <div className="text-xs text-gray-500">{r.scheme} · effective {r.effective}</div>
                  <div className="text-sm mt-1">
                    <span className="font-bold text-field-800">₹{r.mrp.toLocaleString()}</span>
                    <span className="text-gray-500 ml-1">/ {r.bag_kg} kg bag</span>
                  </div>
                  <button
                    onClick={() => useMrpRow(r)}
                    className="mt-2 text-xs text-field-700 font-semibold hover:underline"
                  >
                    Check an offer against this →
                  </button>
                </div>
              ))}
            </div>

            {mrpRef?.note && (
              <p className="text-[11px] text-blue-800 bg-blue-50 rounded-lg p-2 mt-3">
                {mrpRef.note}
              </p>
            )}
          </Card>
        </div>
      )}

      {/* ---------------- ROI ---------------- */}
      {tab === 'roi' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card>
            <h3 className="font-semibold text-field-800 mb-1">{t('market.offerdetails')}</h3>
            <p className="text-xs text-gray-500 mb-3">
              We'll tell you if this price is genuinely worth it, once travel is accounted for.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {roiField('offer_price', 'Offer price / bag (₹)', 'e.g. 300')}
              {roiField('standard_price', 'Normal price / bag (₹)', 'e.g. 380')}
              <div className="col-span-2 -mt-2">
                <p className="text-[10px] text-gray-400">
                  "Normal price" is what you'd pay locally or at MRP — we compare the offer against this.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">Product</label>
                <select
                  value={roiForm.product}
                  onChange={(e) => setRoiForm({ ...roiForm, product: e.target.value })}
                  className="w-full border rounded-lg px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-field-600"
                >
                  {(mrpRef?.reference || []).map((r: any) => (
                    <option key={r.product} value={r.product}>{r.product}</option>
                  ))}
                  {!mrpRef?.reference?.length && <option value={roiForm.product}>{roiForm.product}</option>}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">
                  Which fertilizer — checked against the official govt. price ceiling (MRP).
                </p>
              </div>

              {roiField('bags', 'Number of bags')}

              <div>
                {roiField('distance_km', 'Distance (km)')}
                <p className="text-[10px] text-gray-400 mt-1">
                  How far to the seller — a cheap price isn't a deal if fuel there costs more than you save.
                </p>
              </div>
            </div>

            <details className="mt-4 text-xs text-gray-500">
              <summary className="cursor-pointer font-semibold text-gray-600 select-none">
                Optional: also estimate extra income from using this fertilizer
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-3 bg-gray-50 rounded-xl p-3">
                <p className="col-span-2 text-[11px] text-gray-500">
                  This is a separate, rough guess at extra harvest income — it does NOT
                  change whether the offer itself is a good price (above).
                </p>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">{t('common.crop')}</label>
                  <select
                    value={roiForm.crop}
                    onChange={(e) => setRoiForm({ ...roiForm, crop: e.target.value })}
                    className="w-full border rounded-lg px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-field-600"
                  >
                    {crops.map((c) => (
                      <option key={c.key} value={c.key}>{tv(c.display)}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-400 mt-1">Which crop you'd apply it to.</p>
                </div>
                <div>
                  {roiField('acres', 'Acres')}
                  <p className="text-[10px] text-gray-400 mt-1">How much land it covers.</p>
                </div>
              </div>
            </details>

            {/* Live reference prices, right next to the fields they inform —
                the whole point being the farmer sees a real number to weigh
                their offer against before they even hit Calculate. */}
            <div className="mt-3 flex flex-wrap gap-2">
              {roiCropPriceLoading && (
                <span className="text-[11px] text-gray-400">Checking live {tv(roiForm.crop)} price…</span>
              )}
              {!roiCropPriceLoading && roiCropPrice?.status === 'ok' && (
                <span className="text-[11px] bg-green-50 text-green-800 border border-green-200 rounded-full px-2.5 py-1">
                  🌾 Live {tv(roiForm.crop)} price: ₹{roiCropPrice.best_market.modal_price}/quintal
                  {' '}({roiCropPrice.latest_date})
                </span>
              )}
              {!roiCropPriceLoading && roiCropPrice && roiCropPrice.status !== 'ok' && (
                <span className="text-[11px] bg-gray-50 text-gray-500 border border-gray-200 rounded-full px-2.5 py-1">
                  No live {tv(roiForm.crop)} price available right now
                </span>
              )}
              {(() => {
                const mrpRow = (mrpRef?.reference || []).find((r: any) => r.product === roiForm.product)
                return mrpRow ? (
                  <span className="text-[11px] bg-blue-50 text-blue-800 border border-blue-200 rounded-full px-2.5 py-1">
                    🏛 Govt MRP for {mrpRow.product}: ₹{mrpRow.mrp}/{mrpRow.bag_kg}kg bag
                  </span>
                ) : null
              })()}
            </div>

            <Button onClick={runROI} disabled={roiBusy || !roiCanCalculate}>
              {roiBusy ? `${t('common.calculating')} (${roiElapsed}s)` : t('common.calculate')}
            </Button>
            {roiErr && <p className="text-xs text-red-600 mt-2">{roiErr}</p>}
          </Card>

          <Card>
            <h3 className="font-semibold text-field-800 mb-2">{t('common.result')}</h3>
            {roiBusy && (
              <div className="py-8 text-center">
                <Spinner />
                <p className="text-xs text-gray-400 mt-2">
                  Fetching the live crop price and calculating — usually under 20–30 seconds.
                </p>
              </div>
            )}
            {!roiBusy && !roi && (
              <p className="text-sm text-gray-400 py-8 text-center">
                {t('market.enterpress')}
              </p>
            )}

            {roi && (
              <div className="space-y-3">
                <div className={`rounded-xl p-3 ${roi.worth_it ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className={`text-xl font-bold ${roi.worth_it ? 'text-green-800' : 'text-red-700'}`}>
                    {roi.worth_it ? '✅ Worth it' : '❌ Not worth it'}
                  </div>
                  <div className="text-sm text-gray-700 mt-1">{roi.verdict}</div>
                </div>

                {roi.mrp_flag && (
                  <p className={`text-xs rounded-lg p-2 ${
                    roi.mrp_flag.startsWith('⚠') ? 'bg-red-50 text-red-800' : 'bg-blue-50 text-blue-800'}`}>
                    {roi.mrp_flag}
                  </p>
                )}

                <div>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase mb-1">
                    {t('market.breakdown')}
                  </p>
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b">
                        <td className="py-1 text-gray-600">
                          {roi.breakdown.bags} bag(s) at the offer price
                        </td>
                        <td className="py-1 text-right">₹{roi.breakdown.purchase_cost.toLocaleString()}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-1 text-gray-600">
                          + Transport ({roi.breakdown.distance_km} km round trip)
                        </td>
                        <td className="py-1 text-right">₹{roi.breakdown.transport_cost.toLocaleString()}</td>
                      </tr>
                      <tr className="border-b font-semibold">
                        <td className="py-1 text-gray-700">= Cost at this offer</td>
                        <td className="py-1 text-right">₹{roi.breakdown.cost_at_offer.toLocaleString()}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-1 text-gray-600">
                          vs. cost at the normal price ({roi.breakdown.bags} bag(s), no trip needed)
                        </td>
                        <td className="py-1 text-right">₹{roi.breakdown.cost_at_normal.toLocaleString()}</td>
                      </tr>
                      <tr className="font-bold">
                        <td className="py-1.5">{t('market.net')} (you save)</td>
                        <td className={`py-1.5 text-right ${roi.net_saving >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {roi.net_saving >= 0 ? '+' : '−'}₹{Math.abs(roi.net_saving).toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-gray-600">
                  Break-even distance (further than this, the trip cancels out the saving):{' '}
                  <b>{roi.break_even_distance_km} km</b>
                </p>

                {/* Clearly separated: this NEVER changes the verdict above. */}
                <div className="border-t pt-3">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase mb-1">
                    Optional: potential extra income (separate from the verdict above)
                  </p>
                  {roi.potential_extra_income != null ? (
                    <p className="text-sm text-gray-700">
                      Roughly <b>₹{roi.potential_extra_income.toLocaleString()}</b> in extra income is
                      possible from the estimated yield boost — using today's live crop price.
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-400">
                      Not shown — no live crop price available right now. This has no effect on
                      the worth-it verdict above.
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase mb-1">
                    {t('market.assumptions')}
                  </p>
                  <ul className="text-[11px] text-gray-500 list-disc ml-4 space-y-0.5">
                    {roi.assumptions.map((a: string, i: number) => <li key={i}>{a}</li>)}
                  </ul>
                </div>

                <p className="text-[10px] text-gray-400 border-t pt-2">{roi.disclaimer}</p>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}

