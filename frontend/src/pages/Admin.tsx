import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, PieChart, Pie, Legend } from 'recharts'
import {
  getAdminOverview, getAdminKPIs, getAdminStates, getAdminDistricts, getAdminStateDetail,
  getAdminPriorityAlerts, getAdminPredictive, getAdminEnvironment,
  getAdminDisasterReports, getAdminDisasterReport, adminTakeResponsibility, adminRequestHelp,
  runScenarioPestAdvisory, runScenarioIrrigation,
  proposeAdminAction, listAdminActions, decideAdminAction,
  getFundingOverview, getSchemeBudgetList, getSchemeDetail, getStateFunding,
  getDistrictFunding, getDistrictFundingDetail, getCoverageGap, getFinancialAlerts,
  getDistrictRanking, getWhatChanged, getCropHealthHeatmap, getSatelliteSummary,
  getFarmersBenefited, getMarketplaceActivity, getSchemeEligibility, runPestOutbreakScenario,
} from '../services/api'
import { Card, Spinner, StatCard, StatusPill, Empty, Button, DataSourceBadge } from '../components/UI'
import { useLanguage } from '../contexts/LanguageContext'
import { usePageContext } from '../contexts/PageContext'

type Tab = 'overview' | 'state' | 'alerts' | 'actions' | 'funding' | 'statefunding'
         | 'districtfunding' | 'schemes' | 'eligibility' | 'ranking' | 'crophealth' | 'simulator'
         | 'disasterreports'

const SEVERITY_ICON: Record<string, string> = { CRITICAL: '🔴', WARNING: '🟠', INFO: '🟡' }
const WATER_ICON: Record<string, string> = { normal: '🟢', watch: '🟡', stressed: '🟠', critical: '🔴', unknown: '⚪' }

const KPI_LABELS: [string, string, string][] = [
  ['total_farmers', '👥', 'Total farmers'],
  ['active_farms', '🌾', 'Active farms'],
  ['active_crop_listings', '🛒', 'Active crop listings'],
  ['buyers', '🧑‍💼', 'Buyers'],
  ['active_crop_types', '🌱', 'Active crop types'],
  ['pest_disease_reports', '🐛', 'Pest/disease reports'],
  ['active_alerts', '🔔', 'Active alerts'],
  ['iot_monitored_devices', '📡', 'IoT-monitored farms'],
  ['scheme_engagement', '🏛️', 'Scheme engagement'],
  ['machinery_listings', '🚜', 'Machinery demand'],
]

const TAB_DEFS: { id: Tab; icon: string; label: string; blurb: string }[] = [
  { id: 'overview', icon: '📊', label: 'Overview', blurb: 'Platform-wide numbers, at a glance' },
  { id: 'funding', icon: '💰', label: 'Funding Overview', blurb: 'Budget provision & categories' },
  { id: 'statefunding', icon: '🗺️', label: 'State Funding', blurb: 'Funding distribution across states' },
  { id: 'districtfunding', icon: '🏘️', label: 'District Funding', blurb: 'MP district-wise funding & performance' },
  { id: 'schemes', icon: '📋', label: 'Schemes', blurb: 'Government scheme intelligence' },
  { id: 'eligibility', icon: '🔮', label: 'Scheme Eligibility', blurb: 'Predicted eligibility by state/district' },
  { id: 'ranking', icon: '🏆', label: 'District Ranking', blurb: 'Composite performance ranking' },
  { id: 'crophealth', icon: '🦠', label: 'Crop Health Map', blurb: 'Pest & disease by district' },
  { id: 'state', icon: '📍', label: 'State Intelligence', blurb: 'Drill into one state/district' },
  { id: 'simulator', icon: '🧪', label: 'Scenario Simulator', blurb: '"What if" estimates, human-in-the-loop' },
  { id: 'alerts', icon: '🚨', label: 'Priority Alerts', blurb: 'Things to act on now' },
  { id: 'disasterreports', icon: '📋', label: 'Disaster Reports', blurb: 'All farmer-filed emergency reports' },
  { id: 'actions', icon: '✅', label: 'Actions', blurb: 'Proposed & approved actions' },
]

/** A tap-to-reveal chart box — collapsed by default, so a data-dense tab
 * opens as a short list of dropdowns rather than a wall of graphs. */
function Disclosure({ title, subtitle, defaultOpen = false, children }:
  { title: string; subtitle?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Card className="mb-4 !p-0 overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition">
        <div>
          <h3 className="font-semibold text-field-800">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        <span className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </Card>
  )
}

/**
 * Government / agriculture command center.
 *
 * Everything here is either an observed number (a real row count), a
 * derived analytic (computed from observed numbers, formula shown), or a
 * clearly-labelled scenario simulation — never an invented figure. Where
 * data doesn't exist yet, the page says so instead of guessing.
 *
 * The four sections (Overview, State Intelligence, Priority Alerts,
 * Actions) are tabs in the main green sidebar (see Layout.tsx's ADMIN_TABS)
 * — this page only renders whichever one is selected via the ?tab= query
 * param, the same way every other page in the app is just its own content
 * with no in-page tab strip of its own.
 */
export default function Admin() {
  const { t, tv } = useLanguage()
  const { publish } = usePageContext()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'overview'

  const [data, setData] = useState<any>(null)
  const [kpis, setKpis] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    getAdminOverview().then(setData)
      .catch(() => setErr('Admin access required. Sign in as admin@agri.gov.'))
      .finally(() => setLoading(false))
    getAdminKPIs().then(setKpis).catch(() => {})
  }, [])

  useEffect(() => {
    if (!kpis) return
    publish(`Admin Command Center — ${TAB_DEFS.find((d) => d.id === tab)?.label || 'Overview'} tab`,
      Object.entries(kpis).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(', '))
  }, [kpis, tab]) // eslint-disable-line

  if (loading) return <Spinner />
  if (err) return <Card><p className="text-sm text-red-600">{err}</p></Card>

  const problems = Object.entries(data.major_problems.alerts || {})
    .map(([name, value]) => ({ name: name.replace(/_/g, ' ').toLowerCase(), value }))
  const diseases = Object.entries(data.major_problems.diseases_detected || {})
    .map(([name, value]) => ({ name, value }))
  const COLORS = ['#2f7d40', '#d97706', '#dc2626', '#6366f1', '#0ea5e9']
  const currentTabDef = TAB_DEFS.find((d) => d.id === tab)

  return (
    <div className="max-w-6xl">
      <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-field-800">
            🏛️ Agriculture Command Center {currentTabDef && `— ${currentTabDef.icon} ${currentTabDef.label}`}
          </h1>
          <p className="text-sm text-gray-500">
            {currentTabDef?.blurb || 'Live platform intelligence for agriculture officers'} — observed data,
            derived analytics, and clearly-labelled scenarios only.
          </p>
        </div>
        <a href="/admin/brief" target="_blank" rel="noreferrer"
           className="shrink-0 bg-field-700 hover:bg-field-800 text-white text-sm font-semibold
                     px-4 py-2.5 rounded-xl shadow-sm">
          📄 Generate Government Brief
        </a>
      </div>

      {/* Top-level KPIs — ONLY on Overview. Every other tab used to repeat
          these same numbers at the top, which is exactly the "everything
          looks like the same page" clutter this was rewritten to fix — each
          tab now shows only what's specific to its own purpose. */}
      {tab === 'overview' && kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {KPI_LABELS.map(([key, icon, label]) => (
            <div key={key} className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2.5">
              <div className="text-[11px] text-gray-500">{icon} {label}</div>
              <div className="text-xl font-bold text-field-800">{kpis[key] ?? 0}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'overview' && <OverviewTab data={data} problems={problems} diseases={diseases} COLORS={COLORS} tv={tv}
        goState={(s: string) => setParams((p) => { p.set('tab', 'state'); p.set('state', s); return p })}
        goTab={(t: string) => setParams((p) => { p.set('tab', t); return p })} />}
      {tab === 'funding' && <FundingTab publish={publish} goTab={(t: string) => setParams((p) => { p.set('tab', t); return p })} />}
      {tab === 'statefunding' && <StateFundingTab publish={publish} params={params}
        goDistrictFunding={(s: string) => setParams((p) => { p.set('tab', 'districtfunding'); p.set('fstate', s); return p })} />}
      {tab === 'districtfunding' && <DistrictFundingTab publish={publish} params={params} setParams={setParams} />}
      {tab === 'schemes' && <SchemesTab publish={publish}
        goStateFunding={(id: number) => setParams((p) => { p.set('tab', 'statefunding'); p.set('scheme_id', String(id)); return p })}
        goDistrictFunding={(id: number) => setParams((p) => { p.set('tab', 'districtfunding'); p.set('scheme_id', String(id)); return p })} />}
      {tab === 'eligibility' && <SchemeEligibilityTab publish={publish} />}
      {tab === 'ranking' && <RankingTab publish={publish}
        goDistrictFunding={(d: string) => setParams((p) => { p.set('tab', 'districtfunding'); p.set('district', d); return p })}
        goState={(s: string, d: string) => setParams((p) => { p.set('tab', 'state'); p.set('state', s); p.set('district', d); return p })} />}
      {tab === 'crophealth' && <CropHealthTab publish={publish}
        goState={(s: string, d: string) => setParams((p) => { p.set('tab', 'state'); p.set('state', s); p.set('district', d); return p })} />}
      {tab === 'state' && <StateTab tv={tv} params={params} setParams={setParams} publish={publish}
        goSimulator={(s: string, d: string) => setParams((p) => { p.set('tab', 'simulator'); p.set('state', s); p.set('district', d); return p })} />}
      {tab === 'simulator' && <SimulatorTab publish={publish} params={params} />}
      {tab === 'alerts' && <AlertsTab tv={tv} publish={publish}
        goState={(s: string) => setParams((p) => { p.set('tab', 'state'); p.set('state', s); return p })}
        goIncident={(id: number) => setParams((p) => { p.set('tab', 'disasterreports'); p.set('report', String(id)); return p })} />}
      {tab === 'disasterreports' && <DisasterReportsTab t={t} tv={tv} publish={publish}
        highlightId={params.get('report') ? Number(params.get('report')) : null} />}
      {tab === 'actions' && <ActionsTab publish={publish} />}
    </div>
  )
}

// ---------------------------------------------------------------- Overview

function OverviewTab({ data, problems, diseases, COLORS, tv, goState, goTab }: any) {
  const [impact, setImpact] = useState<any>(null)
  const [activity, setActivity] = useState<any[] | null>(null)

  useEffect(() => {
    getFarmersBenefited().then(setImpact).catch(() => {})
    getMarketplaceActivity().then(setActivity).catch(() => setActivity([]))
    // "Real time" for the buyer portal: poll every 30s so a purchase made in
    // the buyer app shows up here without the officer needing to reload —
    // simple polling rather than a websocket, since this is a low-frequency
    // admin view, not a live trading floor.
    const t = setInterval(() => {
      getMarketplaceActivity().then(setActivity).catch(() => {})
    }, 30000)
    return () => clearInterval(t)
  }, [])

  return (
    <>
      {/* Quick links — every other tab's job in one glance, so the command
          center is discoverable without memorising the sidebar. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 mb-6">
        {[
          ['funding', '💰', 'Government Funding'], ['statefunding', '🗺️', 'State Funding'],
          ['districtfunding', '🏘️', 'District Funding'], ['schemes', '📋', 'Schemes'],
          ['ranking', '🏆', 'District Ranking'], ['crophealth', '🦠', 'Crop Health Map'],
          ['state', '📍', 'State Intelligence'], ['simulator', '🧪', 'Scenario Simulator'],
        ].map(([id, icon, label]) => (
          <button key={id} onClick={() => goTab(id)}
            className="bg-white border border-gray-100 rounded-xl px-3 py-2.5 text-left hover:border-field-300 hover:shadow-sm transition">
            <div className="text-lg">{icon}</div>
            <div className="text-xs font-semibold text-gray-600">{label}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <Card className="bg-field-50/50 border-field-100">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-field-800">🌟 Farmers Benefited by This Application</h3>
            {impact && <DataSourceBadge status={impact.data_status} note={impact.methodology} />}
          </div>
          {impact ? (
            <>
              <p className="text-3xl font-bold text-field-800 mt-1">{impact.total.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">{impact.description}</p>
              <div className="grid grid-cols-3 gap-2 mt-3">
                {impact.breakdown.map((b: any) => (
                  <div key={b.label} className="bg-white rounded-lg p-2 text-center">
                    <div className="text-sm font-bold text-field-700">{b.count.toLocaleString()}</div>
                    <div className="text-[10px] text-gray-500">{b.label}</div>
                  </div>
                ))}
              </div>
            </>
          ) : <Spinner />}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-field-800">🛒 Recent Marketplace Activity</h3>
            <DataSourceBadge status="LIVE" note="Live from the buyer portal & farmer sell-listings — refreshes every 30s." />
          </div>
          <p className="text-xs text-gray-400 mb-3">Real buyer purchases and farmer listings, as they happen.</p>
          {activity === null ? <Spinner /> : activity.length === 0 ? (
            <Empty msg="No marketplace activity yet." />
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {activity.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                  <span>
                    {a.event === 'sold' ? '✅' : '🌾'} <b className="capitalize">{a.crop}</b>
                    {' '}{a.event === 'sold' ? 'sold to' : 'listed by'} {a.event === 'sold' ? a.buyer_name : a.farmer_name}
                    <span className="text-gray-400"> · {a.district || a.state}</span>
                  </span>
                  <span className="text-xs text-gray-400">{a.when}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="mb-6 bg-amber-50 border-amber-100">
        <h3 className="font-semibold text-amber-800 mb-2">📋 Recommended actions</h3>
        <ul className="space-y-1.5 text-sm text-gray-700 list-disc pl-4">
          {data.recommendation_for_government.map((r: string, i: number) => <li key={i}>{r}</li>)}
        </ul>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <Card>
          <h3 className="font-semibold text-field-800 mb-1">Major problems (observed)</h3>
          <p className="text-xs text-gray-400 mb-3">Counts of active alert types raised across all farmers.</p>
          {problems.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={problems} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis type="number" fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="name" fontSize={10} width={110} />
                <Tooltip />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {problems.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty msg="No alerts recorded yet." />}
        </Card>

        <Card>
          <h3 className="font-semibold text-field-800 mb-1">Diseases detected (observed)</h3>
          <p className="text-xs text-gray-400 mb-3">From farmers' own Plant Health photo diagnoses.</p>
          {diseases.length > 0 ? (
            <div className="space-y-2">
              {diseases.map((d: any, i: number) => (
                <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                  <span className="text-sm font-medium">{d.name}</span>
                  <span className="text-sm font-bold text-field-700">{d.value} case(s)</span>
                </div>
              ))}
            </div>
          ) : <Empty msg="No diagnoses recorded yet." />}
        </Card>
      </div>

      <Card className="mb-6">
        <h3 className="font-semibold text-field-800 mb-1">Soil fertility by location (observed + derived)</h3>
        <p className="text-xs text-gray-400 mb-3">Dominant soil-health grade per location, from farmers' own soil test submissions.</p>
        {data.soil_fertility_by_location.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2">Location</th><th>Samples</th><th>Dominant</th><th>Breakdown</th>
                </tr>
              </thead>
              <tbody>
                {data.soil_fertility_by_location.map((f: any, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 font-medium">{f.location}</td>
                    <td>{f.samples}</td>
                    <td><StatusPill status={f.dominant_health} /></td>
                    <td className="text-xs text-gray-500">
                      {Object.entries(f.breakdown).map(([k, v]) => `${k}: ${v}`).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty msg="No soil test data yet." />}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <h3 className="font-semibold text-field-800 mb-3">Scheme demand by farmer category</h3>
          <div className="space-y-2">
            {Object.entries(data.scheme_demand.by_farmer_category || {}).map(([k, v]: any) => (
              <div key={k} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                <span className="text-sm capitalize">{k}</span>
                <span className="text-sm font-bold text-field-700">{v}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h3 className="font-semibold text-field-800 mb-1">Users by state</h3>
          <p className="text-xs text-gray-400 mb-3">Tap a state to open its full intelligence view.</p>
          <div className="space-y-2">
            {Object.entries(data.scheme_demand.by_state || {}).map(([k, v]: any) => (
              <button key={k} onClick={() => goState(k)}
                className="w-full flex items-center justify-between bg-gray-50 hover:bg-field-50 rounded-xl px-3 py-2 transition">
                <span className="text-sm">{k}</span>
                <span className="text-sm font-bold text-field-700">{v} →</span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- Government Funding (top-line only)

const CHART_COLORS = ['#2f7d40', '#5a9c6a', '#d97706', '#dc2626', '#6366f1', '#0ea5e9', '#a855f7', '#ec4899', '#64748b', '#14b8a6']

// States this build has real district registries + seeded demo data for
// (see STATE_DISTRICTS in the backend's government_funding.py — kept in
// sync manually since it's a small, stable list).
const FUNDING_STATES = ['Madhya Pradesh', 'Tamil Nadu', 'Kerala', 'Karnataka', 'Andhra Pradesh', 'Delhi']

// Mirrors STATE_DISTRICTS in the backend's government_funding.py (kept in
// sync manually — small, stable list) so pickers don't need a round trip
// just to know which districts exist for a state.
const STATE_DISTRICTS_MAP: Record<string, string[]> = {
  'Madhya Pradesh': ['Indore', 'Bhopal', 'Ujjain', 'Jabalpur', 'Dewas', 'Sagar'],
  'Tamil Nadu': ['Coimbatore', 'Madurai', 'Chennai', 'Salem', 'Erode', 'Thanjavur'],
  'Kerala': ['Palakkad', 'Thrissur', 'Wayanad', 'Kottayam', 'Alappuzha'],
  'Karnataka': ['Mysuru', 'Belagavi', 'Hassan', 'Tumakuru', 'Ballari'],
  'Andhra Pradesh': ['Guntur', 'Krishna', 'Anantapur', 'Chittoor', 'West Godavari'],
  'Delhi': ['New Delhi'],
}

function FundingTab({ publish, goTab }: any) {
  const [scope, setScope] = useState('India')
  const [overview, setOverview] = useState<any>(null)
  const [changed, setChanged] = useState<any[] | null>(null)

  useEffect(() => {
    setOverview(null)
    getFundingOverview(scope).then(setOverview).catch(() => {})
    getWhatChanged(scope === 'India' ? '' : scope).then(setChanged).catch(() => setChanged([]))
  }, [scope])

  useEffect(() => {
    if (!overview) return
    publish('Government Funding tab',
      `${overview.state} ${overview.financial_year} agriculture provision ${overview.total_label} (${overview.data_status}).`)
  }, [overview]) // eslint-disable-line

  if (!overview) return <Spinner />

  return (
    <>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {['India', ...FUNDING_STATES].map((s) => (
          <button key={s} onClick={() => setScope(s)}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium ${scope === s ? 'bg-field-600 text-white border-field-600' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
            {s}
          </button>
        ))}
      </div>
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <h3 className="font-semibold text-field-800">Government Agriculture Funding — {overview.state} — {overview.financial_year}</h3>
          <DataSourceBadge status={overview.data_status} source={overview.source}
            sourceUrl={overview.source_url} lastUpdated={overview.last_updated}
            note={overview.verification_note} />
        </div>
        <p className="text-3xl font-bold text-field-800 mt-2 mb-1">{overview.total_label}</p>
        <p className="text-xs text-gray-400 mb-4">{overview.budget_provision_note}</p>
        {overview.categories.length === 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
            A category-wise split isn't independently available for {overview.state} in this build — only the total above.
          </p>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {overview.categories.map((c: any, i: number) => (
            <div key={c.key} className="bg-gray-50 rounded-xl p-3">
              <div className="text-[11px] text-gray-500 mb-1">{c.label}</div>
              <div className="text-lg font-bold" style={{ color: CHART_COLORS[i] }}>₹{c.amount_cr.toLocaleString()} Cr</div>
              <div className="text-[10px] text-gray-400">{Math.round(100 * c.amount_cr / overview.total_cr)}% of total</div>
            </div>
          ))}
        </div>
      </Card>

      {changed && changed.length > 0 && (
        <Card className="mb-6 bg-field-50/40">
          <h3 className="font-semibold text-field-800 mb-3">What Changed This Month? <span className="text-xs font-normal text-gray-400">(real platform activity, MP)</span></h3>
          <div className="flex flex-wrap gap-3">
            {changed.map((c: any, i: number) => (
              <div key={i} className={`text-sm px-3 py-2 rounded-xl border ${
                c.tone === 'positive' ? 'bg-green-50 border-green-200 text-green-800' :
                c.tone === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                'bg-gray-50 border-gray-200 text-gray-700'}`}>
                {c.arrow} {c.label} {c.change_pct > 0 ? '+' : ''}{c.change_pct}% <span className="text-gray-400">({c.previous}→{c.current})</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button onClick={() => goTab('statefunding')}
          className="bg-white border rounded-2xl p-4 text-left hover:border-field-300 hover:shadow-sm transition">
          <div className="text-xl mb-1">🗺️ → 📋</div>
          <div className="font-semibold text-field-800">State Funding & Schemes</div>
          <div className="text-xs text-gray-500">See how this funding splits across states and which schemes make it up.</div>
        </button>
        <button onClick={() => goTab('districtfunding')}
          className="bg-white border rounded-2xl p-4 text-left hover:border-field-300 hover:shadow-sm transition">
          <div className="text-xl mb-1">🏘️</div>
          <div className="font-semibold text-field-800">District Funding — Madhya Pradesh</div>
          <div className="text-xs text-gray-500">Allocation, release, utilization and coverage, district by district.</div>
        </button>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- State Funding

function StateFundingTab({ publish, goDistrictFunding, params }: any) {
  const schemeId = params?.get('scheme_id') || ''
  const [states, setStates] = useState<any[] | null>(null)
  const [metric, setMetric] = useState<'allocated_cr' | 'beneficiaries' | 'utilization_pct'>('allocated_cr')

  useEffect(() => {
    setStates(null)
    getStateFunding(undefined, schemeId ? Number(schemeId) : undefined).then(setStates).catch(() => setStates([]))
  }, [schemeId])
  useEffect(() => {
    if (!states) return
    publish('State Funding tab', `${states.length} states shown${schemeId ? ' for the selected scheme' : ''}; Madhya Pradesh figure is VERIFIED, others are illustrative DEMO splits.`)
  }, [states]) // eslint-disable-line

  if (!states) return <Spinner />

  return (
    <>
      {schemeId && (
        <p className="text-xs bg-field-50 border border-field-200 rounded-lg px-3 py-2 mb-3">
          Showing state distribution for one scheme only. <a href="/admin?tab=statefunding" className="underline text-field-700">Clear filter →</a>
        </p>
      )}
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
        ⚠ Illustrative allocation dataset — only Madhya Pradesh's total (🔵 VERIFIED) is a cited real
        figure; other states' shares are 🟠 DEMO proportional splits for this prototype.
      </p>
      <Card className="mb-5">
        <h3 className="font-semibold text-field-800 mb-3">Agriculture Funding Distribution</h3>
        {states.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={states} dataKey="allocated_cr" nameKey="state" cx="50%" cy="50%"
                     outerRadius={95} innerRadius={55} label={(d: any) => `${d.state} ${d.share_pct}%`} labelLine={false}>
                  {states.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => `₹${Number(v).toLocaleString()} Cr`} />
              </PieChart>
            </ResponsiveContainer>
            <div>
              <div className="flex gap-1.5 mb-2">
                {(['allocated_cr', 'beneficiaries', 'utilization_pct'] as const).map((m) => (
                  <button key={m} onClick={() => setMetric(m)}
                    className={`text-xs px-2.5 py-1 rounded-full border ${metric === m ? 'bg-field-600 text-white border-field-600' : 'bg-white border-gray-200'}`}>
                    {m === 'allocated_cr' ? 'Funding' : m === 'beneficiaries' ? 'Beneficiaries' : 'Utilization'}
                  </button>
                ))}
              </div>
              <div className="max-h-72 overflow-y-auto space-y-1.5">
                {[...states].sort((a, b) => (b[metric] || 0) - (a[metric] || 0)).map((s: any) => (
                  <button key={s.state} onClick={() => s.state === 'Madhya Pradesh' && goDistrictFunding(s.state)}
                    className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm text-left transition
                      ${s.state === 'Madhya Pradesh' ? 'bg-field-50 border border-field-200 font-semibold hover:bg-field-100 cursor-pointer' : 'bg-gray-50 cursor-default'}`}>
                    <span>{s.state} <DataSourceBadge status={s.data_status} /> {s.state === 'Madhya Pradesh' && <span className="text-field-600">→ districts</span>}</span>
                    <span>
                      {metric === 'allocated_cr' && `₹${s.allocated_cr?.toLocaleString()} Cr`}
                      {metric === 'beneficiaries' && `${s.beneficiaries?.toLocaleString()} L`}
                      {metric === 'utilization_pct' && (s.utilization_pct != null ? `${s.utilization_pct}%` : '—')}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : <Empty msg="No state funding data seeded yet." />}
      </Card>
    </>
  )
}

// ---------------------------------------------------------------- District Funding

function DistrictFundingTab({ publish, params, setParams }: any) {
  const selectedDistrict = params.get('district') || ''
  const presetState = params.get('fstate') || 'Madhya Pradesh'
  const schemeId = params.get('scheme_id') || ''

  const [districts, setDistricts] = useState<any[] | null>(null)
  const [sortBy, setSortBy] = useState('allocated')
  const [detail, setDetail] = useState<any>(null)

  const setState = (s: string) => setParams((p: URLSearchParams) => { p.set('fstate', s); p.delete('district'); return p })

  useEffect(() => {
    setDistricts(null)
    getDistrictFunding(presetState, undefined, schemeId ? Number(schemeId) : undefined, sortBy)
      .then(setDistricts).catch(() => setDistricts([]))
  }, [sortBy, presetState, schemeId])

  useEffect(() => {
    if (selectedDistrict) {
      setDetail(null)
      getDistrictFundingDetail(selectedDistrict, presetState).then(setDetail).catch(() => {})
    }
  }, [selectedDistrict, presetState])

  useEffect(() => {
    if (!districts) return
    publish('District Funding tab', `${districts.length} ${presetState} districts shown, sorted by ${sortBy}.`)
  }, [districts, sortBy]) // eslint-disable-line

  const openDistrict = (d: string) => setParams((p: URLSearchParams) => { p.set('district', d); return p })

  return (
    <>
      <Card className="mb-5">
        <h3 className="font-semibold text-field-800 mb-1">District Agriculture Funding — {presetState}</h3>
        <p className="text-xs text-gray-400 mb-3">Sort, then tap a district for its full funding & scheme-performance panel.</p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {FUNDING_STATES.map((s) => (
            <button key={s} onClick={() => setState(s)}
              className={`text-xs px-2.5 py-1 rounded-full border ${presetState === s ? 'bg-field-700 text-white border-field-700' : 'bg-white border-gray-200'}`}>
              {s}
            </button>
          ))}
        </div>
        {schemeId && (
          <p className="text-xs bg-field-50 border border-field-200 rounded-lg px-3 py-2 mb-3">
            Showing district distribution for one scheme only.{' '}
            <a href={`/admin?tab=districtfunding&fstate=${encodeURIComponent(presetState)}`} className="underline text-field-700">Clear filter →</a>
          </p>
        )}
        <div className="flex gap-1.5 mb-3 flex-wrap">
          {[['allocated', 'Highest funding'], ['allocated_asc', 'Lowest funding'],
            ['utilization', 'Highest utilization'], ['utilization_asc', 'Lowest utilization'],
            ['beneficiaries', 'Most beneficiaries'], ['coverage_asc', 'Lowest coverage']].map(([v, l]) => (
            <button key={v} onClick={() => setSortBy(v)}
              className={`text-xs px-2.5 py-1 rounded-full border ${sortBy === v ? 'bg-field-600 text-white border-field-600' : 'bg-white border-gray-200'}`}>
              {l}
            </button>
          ))}
        </div>
        {districts === null ? <Spinner /> : districts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500 border-b">
                <th className="py-2">District</th><th>Allocated</th><th>Released</th>
                <th>Beneficiaries</th><th>Utilization</th><th>Farmers</th><th>Coverage</th><th></th>
              </tr></thead>
              <tbody>
                {districts.map((d: any) => (
                  <tr key={d.district} className={`border-b last:border-0 hover:bg-gray-50 cursor-pointer ${selectedDistrict === d.district ? 'bg-field-50' : ''}`}
                      onClick={() => openDistrict(d.district)}>
                    <td className="py-2 font-medium">{d.district}</td>
                    <td>₹{d.allocated_cr} Cr</td>
                    <td>{d.released_cr != null ? `₹${d.released_cr} Cr` : '—'}</td>
                    <td>{d.beneficiaries?.toLocaleString()}</td>
                    <td>{d.utilization_pct != null ? `${d.utilization_pct}%` : '—'}</td>
                    <td>{d.registered_farmers}</td>
                    <td>{d.coverage_pct != null ? `${d.coverage_pct}%` : '—'}</td>
                    <td><DataSourceBadge status={d.data_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty msg="No district funding data seeded yet." />}
      </Card>

      {selectedDistrict && (
        <Card>
          {!detail ? <Spinner /> : (
            <div>
              <h4 className="font-bold text-field-800 mb-3">📍 {selectedDistrict} — Funding & Scheme Performance</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <StatCard label="Allocated" icon="💰" value={`₹${detail.funding.allocated_cr ?? 0} Cr`} />
                <StatCard label="Released" icon="📤" value={detail.funding.released_cr != null ? `₹${detail.funding.released_cr} Cr` : '—'} />
                <StatCard label="Utilized" icon="✅" value={detail.funding.utilized_cr != null ? `₹${detail.funding.utilized_cr} Cr` : '—'} />
                <StatCard label="Beneficiaries" icon="🧑‍🌾" value={detail.funding.beneficiaries ?? '—'} />
              </div>

              <h5 className="font-semibold text-sm mb-2">Scheme Performance</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                {detail.scheme_performance.map((s: any) => (
                  <div key={s.scheme_id} className="bg-gray-50 rounded-lg p-2.5 text-xs">
                    <div className="font-semibold">{s.scheme_name}</div>
                    <div>Beneficiaries: {s.beneficiaries?.toLocaleString()}</div>
                    <div>Funding: ₹{s.allocated_cr} Cr {s.utilization_pct != null && `· ${s.utilization_pct}% used`}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className={`rounded-lg p-3 text-sm ${detail.coverage_gap.status?.includes('Low') ? 'bg-red-50' : 'bg-green-50'}`}>
                  <b>Scheme Coverage Gap</b>
                  <p>Farmers: {detail.coverage_gap.farmers?.toLocaleString()} · Beneficiaries: {detail.coverage_gap.beneficiaries?.toLocaleString()}</p>
                  <p>Coverage: {detail.coverage_gap.coverage_pct}% — {detail.coverage_gap.status}</p>
                  {detail.coverage_gap.recommended_action && <p className="italic mt-1">→ {detail.coverage_gap.recommended_action}</p>}
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-sm">
                  <b>🛰 Satellite Summary</b>
                  {detail.satellite.available ? (
                    <>
                      <p>Avg NDVI: {detail.satellite.avg_ndvi} · Monitored fields: {detail.satellite.monitored_fields}</p>
                      {detail.satellite.flag && <p className="text-amber-700 mt-1">{detail.satellite.flag}</p>}
                    </>
                  ) : <p className="text-gray-400">{detail.satellite.reason}</p>}
                </div>
              </div>

              <p className="text-xs text-gray-400">
                For farm-level operational detail (crops grown, water status, sensor coverage) for this
                district, see the <b>📍 State Intelligence</b> tab.
              </p>
            </div>
          )}
        </Card>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Schemes

function SchemesTab({ publish, goStateFunding, goDistrictFunding }: any) {
  const [schemes, setSchemes] = useState<any[] | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [detail, setDetail] = useState<any>(null)

  useEffect(() => { getSchemeBudgetList().then(setSchemes).catch(() => setSchemes([])) }, [])
  useEffect(() => {
    if (!schemes) return
    publish('Schemes tab', `${schemes.length} scheme budgets tracked for FY2026-27.`)
  }, [schemes]) // eslint-disable-line

  const open = (id: number) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id); setDetail(null)
    getSchemeDetail(id).then(setDetail).catch(() => {})
  }

  if (!schemes) return <Spinner />

  return (
    <Card>
      <h3 className="font-semibold text-field-800 mb-1">Government Scheme Intelligence</h3>
      <p className="text-xs text-gray-400 mb-3">Tap a scheme for budget, beneficiaries, state/district split, trend and source.</p>
      {schemes.length > 0 ? (
        <div className="space-y-2">
          {schemes.map((s: any) => (
            <div key={s.scheme_id} className="border rounded-xl overflow-hidden">
              <button onClick={() => open(s.scheme_id)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 text-left">
                <div>
                  <span className="font-medium text-sm">{s.scheme_name}</span>
                  <span className="text-[10px] text-gray-400 ml-2 uppercase">{s.level}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">₹{s.budget_estimate_cr?.toLocaleString()} Cr</span>
                  {s.utilization_pct != null && (
                    <span className={`text-xs font-bold ${s.utilization_pct >= 70 ? 'text-green-600' : s.utilization_pct >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                      {s.utilization_pct}% used
                    </span>
                  )}
                  <DataSourceBadge status={s.data_status} source={s.source} sourceUrl={s.source_url} lastUpdated={s.last_updated} />
                </div>
              </button>
              {s.utilization_pct != null && (
                <div className="h-1.5 bg-gray-100">
                  <div className="h-1.5 bg-field-500" style={{ width: `${Math.min(100, s.utilization_pct)}%` }} />
                </div>
              )}
              {expanded === s.scheme_id && (
                <div className="px-4 py-3 bg-gray-50/70 border-t text-sm">
                  {!detail ? <Spinner /> : (
                    <div className="space-y-3">
                      <p className="text-gray-600">{detail.purpose}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div><b>Budget</b><br />₹{detail.current_year?.budget_estimate_cr?.toLocaleString()} Cr</div>
                        <div><b>Released</b><br />{detail.current_year?.funds_released_cr != null ? `₹${detail.current_year.funds_released_cr.toLocaleString()} Cr` : 'Release data unavailable'}</div>
                        <div><b>Utilized</b><br />{detail.current_year?.funds_utilized_cr != null ? `₹${detail.current_year.funds_utilized_cr.toLocaleString()} Cr` : '—'}</div>
                        <div><b>Beneficiaries</b><br />{detail.current_year?.beneficiaries_actual != null ? `${detail.current_year.beneficiaries_actual} Cr` : '—'} target {detail.current_year?.beneficiaries_target} Cr</div>
                      </div>
                      {detail.performance && (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">Scheme performance:</span>
                          <span>{detail.performance.label}</span>
                          {detail.performance.overall != null && <span className="text-gray-400">({detail.performance.overall}/100)</span>}
                        </div>
                      )}
                      {detail.trend?.length > 1 && (
                        <ResponsiveContainer width="100%" height={120}>
                          <LineChart data={[...detail.trend].reverse()}>
                            <XAxis dataKey="financial_year" fontSize={10} />
                            <YAxis fontSize={10} />
                            <Tooltip />
                            <Line type="monotone" dataKey="funds_utilized_cr" stroke="#2f7d40" name="Utilized (Cr)" />
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button onClick={() => goStateFunding(s.scheme_id)}
                          className="text-xs bg-white border rounded-full px-3 py-1 hover:bg-field-50">🗺️ View States →</button>
                        <button onClick={() => goDistrictFunding(s.scheme_id)}
                          className="text-xs bg-white border rounded-full px-3 py-1 hover:bg-field-50">🏘️ View Districts →</button>
                        {detail.url && (
                          <a href={detail.url} target="_blank" rel="noreferrer"
                             className="text-xs bg-white border rounded-full px-3 py-1 hover:bg-field-50 text-field-700">🔗 View Source →</a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : <Empty msg="No scheme budget data seeded yet." />}
    </Card>
  )
}

// ---------------------------------------------------------------- Scheme Eligibility Prediction

function SchemeEligibilityTab({ publish }: any) {
  const [state, setState] = useState('Madhya Pradesh')
  const [district, setDistrict] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true); setResult(null)
    getSchemeEligibility(state, district).then(setResult).catch(() => {}).finally(() => setLoading(false))
  }, [state, district])

  useEffect(() => {
    if (!result) return
    publish('Scheme Eligibility tab',
      `${state}${district ? '/' + district : ''}: ${result.farmer_count} farmers; top scheme `
      + `${result.predictions?.[0]?.scheme_name} at ${result.predictions?.[0]?.predicted_eligible_pct}% predicted eligible.`)
  }, [result]) // eslint-disable-line

  const districts = (STATE_DISTRICTS_MAP as any)[state] || []

  return (
    <Card>
      <h3 className="font-semibold text-field-800 mb-1">🔮 Scheme Eligibility Prediction</h3>
      <p className="text-xs text-gray-400 mb-4">
        Every registered farmer's real profile (land size, category, crop) is individually run
        through the same rules-based eligibility engine the farmer-facing Schemes page uses —
        this predicts, from real profiles, what fraction of local farmers would likely qualify
        for each scheme. Not an official enrollment figure.
      </p>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {FUNDING_STATES.map((s) => (
          <button key={s} onClick={() => { setState(s); setDistrict('') }}
            className={`text-xs px-2.5 py-1 rounded-full border ${state === s ? 'bg-field-700 text-white border-field-700' : 'bg-white border-gray-200'}`}>
            {s}
          </button>
        ))}
      </div>
      {districts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button onClick={() => setDistrict('')}
            className={`text-xs px-2.5 py-1 rounded-full border ${!district ? 'bg-field-100 border-field-300 text-field-800' : 'bg-white border-gray-200 text-gray-500'}`}>
            All districts
          </button>
          {districts.map((d: string) => (
            <button key={d} onClick={() => setDistrict(d)}
              className={`text-xs px-2.5 py-1 rounded-full border ${district === d ? 'bg-field-100 border-field-300 text-field-800' : 'bg-white border-gray-200 text-gray-500'}`}>
              {d}
            </button>
          ))}
        </div>
      )}

      {loading && <Spinner />}
      {!loading && result && result.farmer_count === 0 && <Empty msg={result.note} />}
      {!loading && result && result.farmer_count > 0 && (
        <>
          <p className="text-xs text-gray-500 mb-3">{result.farmer_count} registered farmer(s) evaluated. {result.method}</p>
          <div className="space-y-2">
            {result.predictions.map((p: any) => (
              <div key={p.scheme_id} className="border rounded-xl p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-medium text-sm">{p.scheme_name}</span>
                  <span className={`text-sm font-bold ${
                    (p.predicted_eligible_pct ?? 0) >= 60 ? 'text-green-600' :
                    (p.predicted_eligible_pct ?? 0) >= 30 ? 'text-amber-600' : 'text-red-600'}`}>
                    {p.predicted_eligible_pct != null ? `${p.predicted_eligible_pct}%` : 'n/a'} predicted eligible
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                  <div className="h-1.5 bg-field-500" style={{ width: `${p.predicted_eligible_pct ?? 0}%` }} />
                </div>
                <div className="flex gap-3 text-[11px] text-gray-500">
                  <span>✅ Likely: {p.likely_eligible}</span>
                  <span>🟡 Possibly: {p.possibly_eligible}</span>
                  <span>❌ Not eligible: {p.not_eligible}</span>
                  {p.missing_information > 0 && <span>⚪ Missing data: {p.missing_information}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- District Ranking (interactive)

function RankingTab({ publish, goDistrictFunding, goState }: any) {
  const [ranking, setRanking] = useState<any[] | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => { getDistrictRanking().then(setRanking).catch(() => setRanking([])) }, [])
  useEffect(() => {
    if (!ranking) return
    publish('District Ranking tab', ranking.map((r: any) => `${r.district}: ${r.score ?? 'n/a'} (${r.status})`).join('; '))
  }, [ranking]) // eslint-disable-line

  if (!ranking) return <Spinner />

  return (
    <Card>
      <h3 className="font-semibold text-field-800 mb-1">District Agriculture Performance Ranking</h3>
      <p className="text-xs text-gray-400 mb-4">
        Composite score: 50% operational health (soil/pest/water/scheme-adoption/activity) + 30% fund
        utilization + 20% scheme coverage. Tap a row to see the breakdown.
      </p>
      {ranking.length > 0 ? (
        <div className="space-y-2">
          {ranking.map((r: any) => (
            <div key={r.district} className="border rounded-xl overflow-hidden">
              <button onClick={() => setExpanded(expanded === r.district ? null : r.district)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left">
                <span className="text-lg font-bold text-gray-300 w-6">{r.rank}</span>
                <span className="flex-1 font-medium text-sm">{r.district}</span>
                <span className="text-xs text-gray-400">{r.farmer_count} farmers</span>
                <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-2 rounded-full ${r.score >= 70 ? 'bg-green-500' : r.score >= 55 ? 'bg-amber-500' : 'bg-red-500'}`}
                       style={{ width: `${r.score ?? 0}%` }} />
                </div>
                <span className="text-sm font-bold w-10 text-right">{r.score ?? '—'}</span>
                <span className={`text-xs font-semibold w-28 text-right ${
                  r.status === 'Strong' ? 'text-green-600' : r.status === 'Stable' ? 'text-amber-600' : 'text-red-600'}`}>
                  {r.status}
                </span>
              </button>
              {expanded === r.district && (
                <div className="px-4 py-3 bg-gray-50/70 border-t text-sm space-y-2">
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-white rounded-lg p-2 text-center"><b>{r.operational_health ?? '—'}</b><br />Operational health (50%)</div>
                    <div className="bg-white rounded-lg p-2 text-center"><b>{r.fund_utilization_pct ?? '—'}</b><br />Fund utilization (30%)</div>
                    <div className="bg-white rounded-lg p-2 text-center"><b>{r.scheme_coverage_pct ?? '—'}</b><br />Scheme coverage (20%)</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => goDistrictFunding(r.district)} className="text-xs bg-white border rounded-full px-3 py-1 hover:bg-field-50">
                      🏘️ Funding detail →
                    </button>
                    <button onClick={() => goState('Madhya Pradesh', r.district)} className="text-xs bg-white border rounded-full px-3 py-1 hover:bg-field-50">
                      📍 Operational detail →
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : <Empty msg="No ranking data yet." />}
    </Card>
  )
}

// ---------------------------------------------------------------- Crop Health Map

function CropHealthTab({ publish, goState }: any) {
  const [state, setState] = useState('Madhya Pradesh')
  const [heatmap, setHeatmap] = useState<any[] | null>(null)

  useEffect(() => {
    setHeatmap(null)
    getCropHealthHeatmap(state).then(setHeatmap).catch(() => setHeatmap([]))
  }, [state])
  useEffect(() => {
    if (!heatmap) return
    const high = heatmap.filter((h: any) => h.severity === 'HIGH').length
    publish('Crop Health Map tab', `${state}: ${heatmap.length} districts; ${high} at HIGH severity.`)
  }, [heatmap]) // eslint-disable-line

  return (
    <Card>
      <h3 className="font-semibold text-field-800 mb-1">Crop Health Map</h3>
      <p className="text-xs text-gray-400 mb-3">Pest/disease severity by district, from farmers' own Plant Health and Pest Management reports. Tap a district for the full report.</p>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {FUNDING_STATES.map((s) => (
          <button key={s} onClick={() => setState(s)}
            className={`text-xs px-2.5 py-1 rounded-full border ${state === s ? 'bg-field-700 text-white border-field-700' : 'bg-white border-gray-200'}`}>
            {s}
          </button>
        ))}
      </div>
      {!heatmap ? <Spinner /> : heatmap.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {heatmap.map((h: any) => (
            <button key={h.district} onClick={() => goState(state, h.district)}
              className={`rounded-xl p-3 text-left border transition hover:shadow-sm ${
                h.severity === 'HIGH' ? 'bg-red-50 border-red-200' :
                h.severity === 'MODERATE' ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
              <div className="font-semibold text-sm">{h.district}</div>
              <div className="text-xs mt-1">{h.top_disease ? `🦠 ${h.top_disease.disease} (${h.top_disease.reports})` :
                   h.top_pest ? `🐛 ${h.top_pest.pest} (${h.top_pest.reports})` : 'No major issue'}</div>
              <div className={`text-[10px] font-bold uppercase mt-1 ${
                h.severity === 'HIGH' ? 'text-red-600' : h.severity === 'MODERATE' ? 'text-amber-600' : 'text-green-600'}`}>
                {h.severity}
              </div>
            </button>
          ))}
        </div>
      ) : <Empty msg="No crop health data yet." />}
    </Card>
  )
}

// ---------------------------------------------------------------- Scenario Simulator

/**
 * Standalone scenario simulator — pulled out of State Intelligence so that
 * tab can focus purely on observed data, while this one focuses purely on
 * "what if" estimates. Opens pre-scoped to a state/district if it was
 * reached via a link (e.g. from State Intelligence or District Ranking),
 * but also works standalone with its own state/district picker.
 */
function SimulatorTab({ publish, params }: any) {
  const [selectedState, setSelectedState] = useState(params.get('state') || '')
  const [selectedDistrict, setSelectedDistrict] = useState(params.get('district') || '')
  const [states, setStates] = useState<any[]>([])
  const [districts, setDistricts] = useState<any[]>([])
  const [scenario, setScenario] = useState<any>(null)
  const [busy, setBusy] = useState(false)

  const [outbreakBusy, setOutbreakBusy] = useState(false)
  const [outbreakReport, setOutbreakReport] = useState<any>(null)
  const [outbreakError, setOutbreakError] = useState('')
  const [showFiledModal, setShowFiledModal] = useState(false)

  useEffect(() => { getAdminStates().then(setStates).catch(() => {}) }, [])
  useEffect(() => {
    if (!selectedState) { setDistricts([]); return }
    getAdminDistricts(selectedState).then(setDistricts).catch(() => setDistricts([]))
  }, [selectedState])

  useEffect(() => {
    publish('Scenario Simulator tab',
      selectedState ? `Scoped to ${selectedState}${selectedDistrict ? '/' + selectedDistrict : ''}.`
                    : 'No state selected yet.')
  }, [selectedState, selectedDistrict]) // eslint-disable-line

  const run = async (kind: 'pest' | 'irrigation') => {
    if (!selectedState) return
    setBusy(true); setScenario(null)
    try {
      const res = kind === 'pest'
        ? await runScenarioPestAdvisory(selectedState, selectedDistrict)
        : await runScenarioIrrigation(selectedState, selectedDistrict)
      setScenario({ kind, ...res })
    } finally {
      setBusy(false)
    }
  }

  const propose = async (kind: 'pest_advisory' | 'irrigation_support') => {
    await proposeAdminAction(kind, selectedState, selectedDistrict)
    alert('Action proposed — review it in the Actions tab.')
  }

  const runOutbreak = async () => {
    if (!selectedState) return
    setOutbreakBusy(true); setOutbreakReport(null); setOutbreakError('')
    try {
      const res = await runPestOutbreakScenario(selectedState, selectedDistrict)
      if (!res.found) {
        setOutbreakError(res.reason || 'No pest/disease reports found for this area.')
        return
      }
      setOutbreakReport(res)
      // "Automatically get to work" — the report is stored and opened in a
      // new tab the moment it's ready, with no extra click needed to see it.
      sessionStorage.setItem('pest_outbreak_report', JSON.stringify(res))
      window.open('/admin/pest-report', '_blank')
      setShowFiledModal(true)
    } catch {
      setOutbreakError('Could not generate the report — please try again.')
    } finally {
      setOutbreakBusy(false)
    }
  }

  return (
    <Card>
      <h3 className="font-semibold text-field-800 mb-1">🧪 Scenario Simulator</h3>
      <p className="text-xs text-gray-500 mb-4">
        Estimates based on current data — a scenario simulation, not a guaranteed real-world outcome.
      </p>

      <div className="mb-4">
        <div className="text-xs text-gray-400 mb-2">State</div>
        <div className="flex flex-wrap gap-2 mb-3">
          {states.map((s: any) => (
            <button key={s.state} onClick={() => { setSelectedState(s.state); setSelectedDistrict(''); setScenario(null) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition
                ${selectedState === s.state ? 'bg-field-600 text-white border-field-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              {s.state}
            </button>
          ))}
        </div>
        {selectedState && districts.length > 0 && (
          <>
            <div className="text-xs text-gray-400 mb-2">District (optional)</div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { setSelectedDistrict(''); setScenario(null) }}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${!selectedDistrict ? 'bg-field-100 border-field-300 text-field-800' : 'bg-white border-gray-200 text-gray-500'}`}>
                All districts
              </button>
              {districts.map((d: any) => (
                <button key={d.district} onClick={() => { setSelectedDistrict(d.district); setScenario(null) }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${selectedDistrict === d.district ? 'bg-field-100 border-field-300 text-field-800' : 'bg-white border-gray-200 text-gray-500'}`}>
                  {d.district}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {!selectedState ? <Empty msg="Pick a state above to run a scenario." /> : (
        <>
          <div className="flex gap-2 mb-3 flex-wrap">
            <Button variant="ghost" onClick={() => run('pest')} disabled={busy}>
              What if we send a pest advisory here?
            </Button>
            <Button variant="ghost" onClick={() => run('irrigation')} disabled={busy}>
              What if we allocate irrigation support?
            </Button>
          </div>
          {busy && <Spinner />}
          {scenario && (
            <div className="bg-field-50 rounded-xl p-4 text-sm space-y-1 mb-4">
              <p className="font-semibold text-field-800">SCENARIO SIMULATION — {selectedState}{selectedDistrict ? ` / ${selectedDistrict}` : ''}</p>
              {scenario.kind === 'pest' ? (
                <>
                  <p>Farmers targeted: <b>{scenario.farmers_targeted}</b></p>
                  <p>Districts affected: {scenario.districts_affected.join(', ') || '—'}</p>
                  <p className="text-xs text-gray-500">{scenario.expected_coverage}</p>
                  <button onClick={() => propose('pest_advisory')} className="text-xs font-semibold text-field-700 underline mt-2">
                    Propose this as an action →
                  </button>
                </>
              ) : (
                <>
                  <p>Farms targeted: <b>{scenario.farms_targeted}</b></p>
                  <p>Districts affected: {scenario.districts_affected.join(', ') || '—'}</p>
                  <p className="text-xs text-gray-500">{scenario.expected_coverage}</p>
                  <button onClick={() => propose('irrigation_support')} className="text-xs font-semibold text-field-700 underline mt-2">
                    Propose this as an action →
                  </button>
                </>
              )}
            </div>
          )}

          {/* Pest outbreak agent — Section: "10+ farmers report the same
              pest" triggers an automated detect -> AI-draft -> report
              pipeline with no human editing step. See pest_outbreak.py. */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold text-field-800 mb-1">🐛 Pest Outbreak Auto-Report</h4>
            <p className="text-xs text-gray-500 mb-3">
              If 10+ nearby farmers report the same pest, the system automatically gathers the
              evidence and drafts an official report for higher officials — no manual writing.
              If real reports are currently below 10, this runs as a clearly-labelled simulated
              scenario using the area's most-reported real pest.
            </p>
            <Button variant="ghost" onClick={runOutbreak} disabled={outbreakBusy}>
              {outbreakBusy ? 'Gathering evidence & drafting report…' : 'Simulate: 10+ farmers reporting the same pest'}
            </Button>
            {outbreakError && <p className="text-xs text-red-600 mt-2">{outbreakError}</p>}
          </div>
        </>
      )}

      {showFiledModal && outbreakReport && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center">
            <div className="text-4xl mb-2">📄✅</div>
            <h3 className="font-bold text-field-800 text-lg mb-1">Report Filed</h3>
            <p className="text-sm text-gray-600 mb-1">
              {outbreakReport.simulated && (
                <span className="inline-block text-[10px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 mb-2">
                  Simulated scenario
                </span>
              )}
            </p>
            <p className="text-sm text-gray-600 mb-4">
              An official pest outbreak report for <b>{outbreakReport.facts.pest_name}</b> in{' '}
              <b>{outbreakReport.district}</b> has been drafted and opened in a new tab, ready to
              download as a PDF.
            </p>
            <div className="flex gap-2 justify-center">
              <button onClick={() => window.open('/admin/pest-report', '_blank')}
                className="text-xs font-semibold text-field-700 underline">
                Reopen report →
              </button>
            </div>
            <button onClick={() => setShowFiledModal(false)}
              className="mt-5 w-full bg-field-600 hover:bg-field-700 text-white font-semibold py-2.5 rounded-xl">
              OK
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- State Intelligence

function StateTab({ tv, params, setParams, publish, goSimulator }: any) {
  const selectedState = params.get('state') || ''
  const selectedDistrict = params.get('district') || ''

  const [states, setStates] = useState<any[]>([])
  const [statesLoading, setStatesLoading] = useState(true)
  const [districts, setDistricts] = useState<any[]>([])
  const [detail, setDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [predictive, setPredictive] = useState<any>(null)
  const [environment, setEnvironment] = useState<any>(null)

  useEffect(() => {
    getAdminStates().then(setStates).catch(() => {}).finally(() => setStatesLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedState) return
    setDetailLoading(true)
    setDetail(null); setPredictive(null); setEnvironment(null)
    getAdminDistricts(selectedState).then(setDistricts).catch(() => setDistricts([]))
    getAdminStateDetail(selectedState, selectedDistrict).then(setDetail)
      .catch(() => {}).finally(() => setDetailLoading(false))
    getAdminPredictive(selectedState).then(setPredictive).catch(() => {})
    getAdminEnvironment(selectedState, selectedDistrict).then(setEnvironment).catch(() => {})
  }, [selectedState, selectedDistrict])

  useEffect(() => {
    if (!detail) return
    const hs = detail.health_score
    publish(`Admin — State Intelligence: ${detail.state}${detail.district ? '/' + detail.district : ''}`,
      `${detail.farmer_count} farmer(s). Health score ${hs?.score ?? 'n/a'} (${hs?.label}). `
      + `Dominant crops: ${detail.crops.dominant.map((c: any) => `${c.crop} (${c.farms} farms)`).join(', ') || 'none'}. `
      + `Pest reports: ${detail.pest_disease.pest_reports.map((p: any) => `${p.pest}: ${p.reports}`).join(', ') || 'none'}. `
      + `Water: ${JSON.stringify(detail.water.by_status)}. `
      + `Scheme adoption: ${detail.schemes.adoption_pct ?? 'n/a'}%. `
      + `Immediate alerts: ${detail.immediate_alerts.length}.`)
  }, [detail]) // eslint-disable-line

  const openState = (state: string) => setParams((p: URLSearchParams) => {
    p.set('tab', 'state'); p.set('state', state); p.delete('district'); return p
  })
  const openDistrict = (district: string) => setParams((p: URLSearchParams) => {
    p.set('district', district); return p
  })
  const clearDistrict = () => setParams((p: URLSearchParams) => { p.delete('district'); return p })

  return (
    <>
      <Card className="mb-6">
        <h3 className="font-semibold text-field-800 mb-1">Choose a state</h3>
        <p className="text-xs text-gray-400 mb-3">Then optionally narrow to a district. Only places with registered farmers are listed.</p>
        {statesLoading ? <Spinner /> : states.length === 0 ? (
          <Empty msg="No states with registered farmers yet." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {states.map((s: any) => (
              <button key={s.state} onClick={() => openState(s.state)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border transition
                  ${selectedState === s.state
                    ? 'bg-field-600 text-white border-field-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                {s.state} <span className="opacity-70">({s.farmer_count})</span>
              </button>
            ))}
          </div>
        )}

        {selectedState && districts.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <div className="text-xs text-gray-400 mb-2">District (optional — narrows the view further)</div>
            <div className="flex flex-wrap gap-2">
              <button onClick={clearDistrict}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border
                  ${!selectedDistrict ? 'bg-field-100 border-field-300 text-field-800' : 'bg-white border-gray-200 text-gray-500'}`}>
                All districts
              </button>
              {districts.map((d: any) => (
                <button key={d.district} onClick={() => openDistrict(d.district)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border
                    ${selectedDistrict === d.district ? 'bg-field-100 border-field-300 text-field-800' : 'bg-white border-gray-200 text-gray-500'}`}>
                  {d.district} ({d.farmer_count})
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {!selectedState && !statesLoading && <Empty msg="Pick a state above to see its intelligence." />}
      {detailLoading && <Spinner />}

      {detail && !detailLoading && (
        <>
          <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
            <div>
              <h2 className="text-xl font-bold text-field-800">
                📍 {detail.state}{detail.district ? ` / ${detail.district}` : ''}
              </h2>
              <p className="text-sm text-gray-500">{detail.farmer_count} registered farmer(s)/grower(s) · {detail.note}</p>
            </div>
            <HealthScoreCard hs={detail.health_score} />
          </div>

          {/* Immediate problems */}
          <Card className="mb-6 bg-red-50 border-red-100">
            <h3 className="font-semibold text-red-800 mb-3">🚨 Immediate problems</h3>
            {detail.immediate_alerts.length === 0 ? (
              detail.health_score?.score !== null && detail.health_score?.score < 45 ? (
                // A low composite score with zero raised alerts looks like a
                // contradiction ("36/100" next to "nothing to worry about")
                // unless it's explained: these are two different signals —
                // the score reacts to soil tests / scheme adoption / etc,
                // which don't raise a time-boxed Alert row the way an acute
                // pest outbreak does. Say that plainly instead of implying
                // "all clear".
                <p className="text-sm text-gray-600">
                  No warning/critical alerts were raised in the last 30 days — but the Agricultural
                  Health Score above is low ({detail.health_score.score}/100, {detail.health_score.label}).
                  That's not a contradiction: the score also reacts to things like soil test results
                  and scheme adoption, which don't raise a time-boxed alert the way an acute pest
                  outbreak does. Open <b>"Why is this the score?"</b> above to see which factor is
                  driving it.
                </p>
              ) : (
                <p className="text-sm text-gray-500">No warning/critical alerts in the last 30 days.</p>
              )
            ) : (
              <div className="space-y-2">
                {detail.immediate_alerts.map((a: any, i: number) => (
                  <div key={i} className="bg-white rounded-xl px-3 py-2 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{a.title}</div>
                      <div className="text-xs text-gray-500">{a.message}</div>
                    </div>
                    <StatusPill status={a.severity} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Dropdown graph analysis — crop grown / moisture / temperature */}
          <div className="mb-2">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide px-1">📈 Trend charts (tap to expand)</h3>
          </div>

          <Disclosure title="🌾 Crop grown trend"
            subtitle={predictive?.available
              ? `Marketplace listing activity is ${predictive.direction}`
              : 'Statistical trend over marketplace listings'}>
            {!predictive ? <Spinner /> : !predictive.available ? (
              <Empty msg={predictive.reason} />
            ) : (
              <>
                <p className="text-sm mb-2">
                  Next-period estimate: <b>{predictive.forecast_next_period}</b> new listing(s)
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={predictive.history}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="period" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" name="Crops listed" stroke="#2f7d40" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-[11px] text-gray-400 mt-1">{predictive.method}</p>
              </>
            )}
          </Disclosure>

          <Disclosure title="💧 Soil moisture trend"
            subtitle={environment?.available
              ? `Daily average across ${environment.monitored_farms} monitored farm(s)`
              : 'Real ESP32/sensor readings, averaged per day'}>
            {!environment ? <Spinner /> : !environment.available ? (
              <Empty msg={environment.reason} />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={environment.history}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="day" fontSize={11} />
                    <YAxis fontSize={11} unit="%" />
                    <Tooltip />
                    <Line type="monotone" dataKey="soil_moisture" name="Soil moisture %" stroke="#0ea5e9" strokeWidth={2} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-[11px] text-gray-400 mt-1">{environment.method}</p>
              </>
            )}
          </Disclosure>

          <Disclosure title="🌡️ Temperature trend"
            subtitle={environment?.available
              ? `Daily average across ${environment.monitored_farms} monitored farm(s)`
              : 'Real ESP32/sensor readings, averaged per day'}>
            {!environment ? <Spinner /> : !environment.available ? (
              <Empty msg={environment.reason} />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={environment.history}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="day" fontSize={11} />
                    <YAxis fontSize={11} unit="°C" />
                    <Tooltip />
                    <Line type="monotone" dataKey="temperature" name="Temperature °C" stroke="#d97706" strokeWidth={2} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-[11px] text-gray-400 mt-1">{environment.method}</p>
              </>
            )}
          </Disclosure>

          {/* Crops */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6 mt-2">
            <Card>
              <h3 className="font-semibold text-field-800 mb-3">🌾 Dominant crops (observed)</h3>
              {detail.crops.dominant.length === 0 ? <Empty msg="No farm crop data yet." /> : (
                <div className="space-y-2">
                  {detail.crops.dominant.map((c: any, i: number) => (
                    <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                      <span className="text-sm font-medium">{tv(c.crop)}</span>
                      <span className="text-sm text-field-700 font-bold">{c.farms} farm(s)</span>
                    </div>
                  ))}
                </div>
              )}
              {(detail.crops.increasing.length > 0 || detail.crops.declining.length > 0) && (
                <div className="mt-3 pt-3 border-t text-xs space-y-1">
                  {detail.crops.increasing.length > 0 && (
                    <p className="text-field-700">📈 Increasing: {detail.crops.increasing.map(tv).join(', ')}</p>
                  )}
                  {detail.crops.declining.length > 0 && (
                    <p className="text-red-600">📉 Declining: {detail.crops.declining.map(tv).join(', ')}</p>
                  )}
                  <p className="text-gray-400">{detail.crops.trend_basis}</p>
                </div>
              )}
            </Card>

            <Card>
              <h3 className="font-semibold text-field-800 mb-3">💰 Most sold crops (observed sales)</h3>
              {detail.most_sold_crops.length === 0 ? <Empty msg="No completed marketplace sales yet." /> : (
                <div className="space-y-2">
                  {detail.most_sold_crops.map((c: any, i: number) => (
                    <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                      <span className="text-sm font-medium">{tv(c.crop)}</span>
                      <span className="text-sm text-field-700 font-bold">{c.listings_sold} sale(s) · {c.total_kg} kg</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Pest & disease + water */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
            <Card>
              <h3 className="font-semibold text-field-800 mb-3">🐛 Pest & disease intelligence</h3>
              {detail.pest_disease.pest_reports.length === 0 && detail.pest_disease.disease_reports.length === 0 ? (
                <Empty msg="No pest or disease reports yet." />
              ) : (
                <div className="space-y-3">
                  {detail.pest_disease.pest_reports.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1">Pests</p>
                      {detail.pest_disease.pest_reports.map((p: any, i: number) => (
                        <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5 mb-1">
                          <span className="text-sm">{p.pest}</span>
                          <span className="text-sm font-bold text-field-700">{p.reports}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {detail.pest_disease.disease_reports.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1">Diseases</p>
                      {detail.pest_disease.disease_reports.map((p: any, i: number) => (
                        <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5 mb-1">
                          <span className="text-sm">{p.disease}</span>
                          <span className="text-sm font-bold text-field-700">{p.reports}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {Object.keys(detail.pest_disease.by_severity).length > 0 && (
                    <p className="text-xs text-gray-500">
                      By severity: {Object.entries(detail.pest_disease.by_severity).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                    </p>
                  )}
                </div>
              )}
            </Card>

            <Card>
              <h3 className="font-semibold text-field-800 mb-3">💧 Water stress intelligence</h3>
              {detail.water.monitored_farms === 0 ? (
                <Empty msg="No live sensor data available." />
              ) : (
                <div className="space-y-2">
                  {Object.entries(detail.water.by_status).map(([status, n]: any) => (
                    <div key={status} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                      <span className="text-sm capitalize">{WATER_ICON[status] || ''} {status}</span>
                      <span className="text-sm font-bold text-field-700">{n} farm(s)</span>
                    </div>
                  ))}
                  <p className="text-xs text-gray-400">{detail.water.note} ({detail.water.monitored_farms}/{detail.water.total_farms} farms monitored)</p>
                </div>
              )}
            </Card>
          </div>

          {/* Soil, schemes, machinery */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
            <Card>
              <h3 className="font-semibold text-field-800 mb-3">🧪 Soil conditions</h3>
              {detail.soil.samples === 0 ? <Empty msg="No soil tests yet." /> : (
                <div className="space-y-2">
                  {Object.entries(detail.soil.breakdown).map(([k, v]: any) => (
                    <div key={k} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                      <StatusPill status={k} />
                      <span className="text-sm font-bold text-field-700">{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <h3 className="font-semibold text-field-800 mb-3">🏛️ Scheme utilization</h3>
              <div className="text-3xl font-bold text-field-800">
                {detail.schemes.adoption_pct !== null ? `${detail.schemes.adoption_pct}%` : '—'}
              </div>
              <p className="text-xs text-gray-500 mb-2">
                {detail.schemes.engaged_farmers} of {detail.schemes.eligible_farmers} eligible farmer(s) engaged
              </p>
              {detail.schemes_chosen.length > 0 && (
                <div className="space-y-1 mt-2 pt-2 border-t">
                  {detail.schemes_chosen.slice(0, 3).map((s: any, i: number) => (
                    <div key={i} className="text-xs flex justify-between">
                      <span className="truncate pr-2">{s.scheme}</span>
                      <span className="font-bold text-field-700 shrink-0">{s.farmers}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <h3 className="font-semibold text-field-800 mb-3">🚜 Machinery demand</h3>
              {detail.machinery_demand.length === 0 ? <Empty msg="No machinery listings yet." /> : (
                <div className="space-y-2">
                  {detail.machinery_demand.map((m: any, i: number) => (
                    <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                      <span className="text-sm capitalize">{m.machine.replace(/_/g, ' ')}</span>
                      <span className="text-sm font-bold text-field-700">{m.demand_score}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Scenario simulator now lives in its own tab (see SimulatorTab)
              — this used to be embedded inline here, which made State
              Intelligence do two jobs at once. A link, pre-scoped to
              whatever state/district is currently selected, is enough. */}
          <button onClick={() => goSimulator(selectedState, selectedDistrict)}
            className="w-full bg-field-50 border border-field-200 rounded-2xl p-4 text-left hover:bg-field-100 transition flex items-center justify-between">
            <div>
              <div className="font-semibold text-field-800">🧪 Try the Scenario Simulator</div>
              <div className="text-xs text-gray-500">
                "What if we send a pest advisory / allocate irrigation support here?" — opens
                pre-scoped to {detail.state}{detail.district ? ` / ${detail.district}` : ''}.
              </div>
            </div>
            <span className="text-field-600 text-lg">→</span>
          </button>
        </>
      )}
    </>
  )
}

function HealthScoreCard({ hs }: any) {
  const [open, setOpen] = useState(false)
  if (!hs) return null
  const color = hs.score === null ? 'text-gray-400' : hs.score >= 70 ? 'text-field-700' : hs.score >= 45 ? 'text-amber-600' : 'text-red-600'
  return (
    <div className="bg-white rounded-2xl border shadow-sm px-4 py-3 min-w-[180px]">
      <div className="text-xs text-gray-500">Agricultural Health Score</div>
      <div className={`text-3xl font-bold ${color}`}>{hs.score !== null ? `${hs.score}/100` : '—'}</div>
      <div className="text-xs font-semibold">{hs.label}</div>
      <button onClick={() => setOpen(!open)} className="text-[11px] text-field-600 underline mt-1">
        {open ? 'Hide' : 'Why is this the score?'}
      </button>
      {open && (
        <div className="mt-2 pt-2 border-t space-y-1.5">
          {hs.breakdown.map((b: any, i: number) => (
            <div key={i} className="text-[11px]">
              <div className="flex justify-between">
                <span className="font-medium">{b.factor.replace(/_/g, ' ')} ({b.weight_pct}%)</span>
                <span>{b.score !== null ? Math.round(b.score) : 'no data'}</span>
              </div>
              <div className="text-gray-400">{b.evidence}</div>
            </div>
          ))}
          <p className="text-gray-400 pt-1">{hs.methodology}</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Priority Alerts

function AlertsTab({ tv, goState, goIncident, publish }: any) {
  const [alerts, setAlerts] = useState<any[] | null>(null)
  useEffect(() => {
    getAdminPriorityAlerts().then((res) => {
      setAlerts(res)
      publish('Admin — Priority Alerts', res.length
        ? res.map((a: any) => `[${a.severity}] ${a.title}: ${a.evidence} → ${a.recommended_action}`).join(' | ')
        : 'No priority alerts right now.')
    }).catch(() => setAlerts([]))
  }, []) // eslint-disable-line

  if (alerts === null) return <Spinner />

  return (
    <>
      <Card className="mb-4 bg-gray-50">
        <p className="text-xs text-gray-500">
          Every alert here is generated from a named threshold crossed by real platform
          data (e.g. pest reports rising vs. the prior 30 days, or farms below optimal
          soil moisture) — never added just to fill the page. Tap "Why was this
          generated?" on any alert to see the exact evidence.
        </p>
        <div className="flex gap-4 mt-2 text-xs">
          <span>🔴 Critical</span><span>🟠 Warning</span><span>🟡 Informational</span>
        </div>
      </Card>

      {alerts.length === 0 ? (
        <Card><Empty msg="No priority alerts right now — no monitored threshold has been crossed." /></Card>
      ) : (
        <div className="space-y-3">
          {alerts.map((a, i) => (
            <Card key={i}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{SEVERITY_ICON[a.severity]}</span>
                    <h4 className="font-semibold text-field-800">{a.title}</h4>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{a.evidence}</p>
                  <details className="mt-2 text-xs text-gray-500">
                    <summary className="cursor-pointer font-medium">Why was this generated?</summary>
                    <ul className="list-disc pl-4 mt-1 space-y-0.5">
                      {a.why.map((w: string, j: number) => <li key={j}>{w}</li>)}
                    </ul>
                  </details>
                  <p className="text-xs text-field-700 font-medium mt-2">➡️ {a.recommended_action}</p>
                </div>
                <button onClick={() => a.type === 'emergency' && a.report_id ? goIncident(a.report_id) : goState(a.state)}
                  className="text-xs font-semibold bg-field-600 text-white px-3 py-1.5 rounded-lg whitespace-nowrap">
                  View details →
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Actions (human-in-the-loop)

function ActionsTab({ publish }: any) {
  const [actions, setActions] = useState<any[] | null>(null)
  const load = () => getAdminActionsSafe().then((res) => {
    setActions(res)
    publish('Admin — Actions', res.length
      ? res.map((a: any) => `${a.title} [${a.status}] — affects ${a.affected_count}`).join(' | ')
      : 'No proposed actions yet.')
  })
  useEffect(() => { load() }, []) // eslint-disable-line

  const decide = async (id: number, status: 'approved' | 'rejected') => {
    await decideAdminAction(id, status)
    load()
  }

  if (actions === null) return <Spinner />

  return (
    <>
      <Card className="mb-4 bg-gray-50">
        <p className="text-xs text-gray-500">
          <b>Human-in-the-loop:</b> the platform proposes an action from real data (e.g.
          "send a pest advisory to 42 affected farmers"); nothing happens until you
          approve it here. Approving records the decision — this platform has no
          SMS/notification system yet, so nothing is actually sent.
        </p>
      </Card>

      {actions.length === 0 ? (
        <Card><Empty msg="No proposed actions yet — propose one from the State Intelligence tab's scenario simulator." /></Card>
      ) : (
        <div className="space-y-3">
          {actions.map((a) => (
            <Card key={a.id}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h4 className="font-semibold text-field-800">{a.title}</h4>
                  <p className="text-xs text-gray-500">{a.description}</p>
                  <ul className="text-xs text-gray-600 list-disc pl-4 mt-1">
                    {(a.reasoning || []).map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                  <p className="text-xs text-gray-400 mt-1">Affected: {a.affected_count}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={a.status === 'approved' ? 'OPTIMAL' : a.status === 'rejected' ? 'CRITICAL' : 'WARNING'} />
                  {a.status === 'proposed' && (
                    <>
                      <button onClick={() => decide(a.id, 'approved')} className="text-xs font-semibold bg-field-600 text-white px-3 py-1.5 rounded-lg">Approve</button>
                      <button onClick={() => decide(a.id, 'rejected')} className="text-xs font-semibold bg-white border px-3 py-1.5 rounded-lg">Reject</button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

function getAdminActionsSafe() {
  return listAdminActions().catch(() => [])
}

// ---------------------------------------------------------------- Disaster Reports

function DisasterReportsTab({ t, tv, publish, highlightId }: any) {
  const [reports, setReports] = useState<any[] | null>(null)
  const [filter, setFilter] = useState('all')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [helpNoteFor, setHelpNoteFor] = useState<number | null>(null)
  const [helpNote, setHelpNote] = useState('')

  const load = () => {
    getAdminDisasterReports().then((res) => {
      setReports(res)
      publish('Admin — Disaster Reports', res.length
        ? `${res.length} report(s) filed. Types: ${[...new Set(res.map((r: any) => r.disaster_type))].join(', ')}.`
        : 'No disaster reports filed yet.')
    }).catch(() => setReports([]))
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  if (reports === null) return <Spinner />

  const filtered = filter === 'all' ? reports : reports.filter((r) => r.severity === filter.toUpperCase())
  const severityColor = (s: string) => {
    if (s === 'CRITICAL') return 'bg-red-100 border-red-200 text-red-800'
    if (s === 'HIGH') return 'bg-orange-100 border-orange-200 text-orange-800'
    if (s === 'MODERATE') return 'bg-amber-100 border-amber-200 text-amber-800'
    return 'bg-green-100 border-green-200 text-green-800'
  }
  const disasterIcon: Record<string, string> = {
    flood: '🌊', drought: '🏜️', pest: '🐛', disease: '🍃', fire: '🔥', other: '⚠️',
  }

  const takeResponsibility = async (id: number) => {
    setBusyId(id)
    try {
      await adminTakeResponsibility(id)
      load()
    } finally {
      setBusyId(null)
    }
  }

  const requestHelp = async (id: number) => {
    setBusyId(id)
    try {
      await adminRequestHelp(id, helpNote)
      setHelpNoteFor(null); setHelpNote('')
      load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <Card className="mb-4 bg-gray-50">
        <p className="text-xs text-gray-500">
          {t('admin.disasterreports.blurb')}. {t('admin.disasterreports.description')}:
        </p>
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {[['all', t('admin.disasterreports.all')],
            ['critical', t('admin.disasterreports.critical')],
            ['high', t('admin.disasterreports.high')],
            ['moderate', t('admin.disasterreports.moderate')],
            ['low', t('admin.disasterreports.low')]].map(([v, label]) => (
            <button key={v} onClick={() => setFilter(v)}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium
                ${filter === v ? 'bg-field-600 text-white border-field-600' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card><Empty msg={t('admin.disasterreports.noreports')} /></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r: any) => (
            <Card key={r.id} className={highlightId === r.id ? 'ring-2 ring-field-500' : ''}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{disasterIcon[r.disaster_type] || '⚠️'}</span>
                    <h4 className="font-semibold text-field-800">{tv(r.disaster_type)}</h4>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${severityColor(r.severity)}`}>
                      {r.severity}
                    </span>
                  </div>
                  {/* Exactly what the farmer captured at the scene — no fabricated
                      or generic substitute fields. */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-gray-600 mt-2">
                    <div>
                      <span className="text-gray-400">{t('admin.disasterreports.farmer')}:</span>{' '}
                      <span className="font-medium">{r.farmer_name}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">{t('admin.disasterreports.location')}:</span>{' '}
                      <span className="font-medium">{r.district || '—'}, {r.state || '—'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">{t('admin.disasterreports.date')}:</span>{' '}
                      <span className="font-medium">{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">{t('admin.disasterreports.routedto')}:</span>{' '}
                      <span className="font-medium">{r.filed_to || '—'}</span>
                    </div>
                  </div>
                  {r.description && (
                    <p className="text-xs text-gray-500 mt-2">{r.description}</p>
                  )}
                  {r.severity_reason && (
                    <p className="text-[11px] text-gray-400 mt-1">{r.severity_reason}</p>
                  )}

                  {/* Admin response controls — take ownership of this specific
                      incident, or trigger an escalation/help request, right
                      from its own detail view. */}
                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-2 border-t border-gray-100">
                    {r.assigned_admin_name ? (
                      <span className="text-[11px] text-field-700 font-medium">
                        ✅ {t('admin.disasterreports.assignedto')}: {r.assigned_admin_name}
                      </span>
                    ) : (
                      <button onClick={() => takeResponsibility(r.id)} disabled={busyId === r.id}
                        className="text-xs font-semibold bg-field-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
                        {t('admin.disasterreports.takeresponsibility')}
                      </button>
                    )}
                    {r.help_requested_at ? (
                      <span className="text-[11px] text-amber-700 font-medium">
                        🆘 {t('admin.disasterreports.helprequested')}
                      </span>
                    ) : helpNoteFor === r.id ? (
                      <div className="flex items-center gap-1.5">
                        <input value={helpNote} onChange={(e) => setHelpNote(e.target.value)}
                          placeholder="Note (optional)"
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 w-40" />
                        <button onClick={() => requestHelp(r.id)} disabled={busyId === r.id}
                          className="text-xs font-semibold bg-amber-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
                          {t('admin.disasterreports.requesthelp')}
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setHelpNoteFor(r.id)}
                        className="text-xs font-semibold border border-amber-300 text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-50">
                        {t('admin.disasterreports.requesthelp')}
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-gray-400">{r.reference_no}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    {t('admin.disasterreports.media')}: {r.has_media ? t('admin.disasterreports.yes') : t('admin.disasterreports.no')}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
