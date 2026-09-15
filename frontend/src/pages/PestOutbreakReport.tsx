import { useEffect, useState } from 'react'
import { DataSourceBadge } from '../components/UI'

/**
 * Printable pest outbreak report — opened automatically by the Scenario
 * Simulator's "10+ farmers reporting the same pest" button (see
 * SimulatorTab.runOutbreak in Admin.tsx).
 *
 * Reads the report from sessionStorage rather than re-fetching by ID: the
 * report is a one-shot artifact of that scenario run, not a persisted
 * record with its own stable backend URL, so this keeps the pipeline
 * simple and stateless. Same print-to-PDF approach as GovernmentBrief.tsx —
 * no server-side PDF library in this project, so "download PDF" is the
 * browser's native print dialog (Ctrl/Cmd+P → Save as PDF), producing a
 * real PDF with zero new dependencies.
 */
export default function PestOutbreakReport() {
  const [report, setReport] = useState<any>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    const raw = sessionStorage.getItem('pest_outbreak_report')
    if (!raw) { setErr('No report found in this browser tab. Generate one from the Scenario Simulator.'); return }
    try { setReport(JSON.parse(raw)) } catch { setErr('Could not read the report data.') }
  }, [])

  if (err) return <div className="p-10 text-center text-red-600">{err}</div>
  if (!report) return <div className="p-10 text-center text-gray-400">Loading report…</div>

  const f = report.facts

  return (
    <div className="max-w-3xl mx-auto p-8 print:p-0 bg-white text-gray-800">
      <style>{`@media print { .no-print { display: none !important; } body { background: white; } }`}</style>

      <div className="no-print flex justify-end mb-4">
        <button onClick={() => window.print()}
          className="bg-field-700 hover:bg-field-800 text-white text-sm font-semibold px-4 py-2 rounded-xl">
          🖨️ Export PDF (Print)
        </button>
      </div>

      {report.simulated && (
        <div className="bg-amber-50 border border-amber-300 text-amber-800 text-sm font-semibold rounded-xl px-4 py-3 mb-5">
          ⚠ SIMULATED SCENARIO — generated for demonstration. The pest/crop/district shown are
          real current reports, but the affected-farmer count has been scaled to the 10-farmer
          threshold; this is not a confirmed real outbreak at that scale.
        </div>
      )}

      <div className="border-b-4 border-field-700 pb-3 mb-5">
        <p className="text-xs uppercase tracking-wide text-gray-400">Agriculture Command Center — Official Report</p>
        <h1 className="text-2xl font-bold text-field-800">{report.title}</h1>
        <p className="text-xs text-gray-400">
          {report.district}, {report.state} · Generated {new Date(report.generated_at).toLocaleString()}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat label="Affected farmers" value={f.affected_farmer_count} />
        <Stat label="Pest / crop" value={`${f.pest_name} / ${f.crop}`} />
        <Stat label="Acres at risk (est.)" value={f.acres_at_risk ?? '—'} />
        <Stat label="Window" value={`${f.window_days} days`} />
      </div>

      <div className="whitespace-pre-wrap text-sm leading-relaxed mb-6 border rounded-xl p-4 bg-gray-50/60">
        {report.narrative}
      </div>

      <div className="mb-6">
        <h2 className="text-sm font-bold text-field-700 uppercase tracking-wide mb-2">Underlying Data (verified)</h2>
        <table className="w-full text-xs">
          <tbody>
            <tr className="border-b"><td className="py-1.5 text-gray-500 w-1/2">Real farmer reports (this window)</td><td className="font-medium">{f.real_farmer_count}</td></tr>
            <tr className="border-b"><td className="py-1.5 text-gray-500">Districts affected</td><td className="font-medium">{(f.districts_hit || []).join(', ') || '—'}</td></tr>
            <tr className="border-b"><td className="py-1.5 text-gray-500">Severity breakdown</td><td className="font-medium">{Object.entries(f.severity_counts || {}).map(([k, v]) => `${k}: ${v}`).join(', ') || 'not recorded'}</td></tr>
            <tr className="border-b"><td className="py-1.5 text-gray-500">Avg. land size of affected farmers</td><td className="font-medium">{f.avg_land_size_acres ?? '—'} acres</td></tr>
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-gray-400 mt-8 border-t pt-3">
        Facts gathered automatically from this platform's own pest/disease reports (a real farmer
        signal, not an official agricultural census); narrative drafted by an LLM constrained to
        those facts only. <DataSourceBadge status={report.simulated ? 'DEMO' : 'LIVE'}
          note="Not independently audited — verify with field officers before formal escalation." />
      </p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="text-lg font-bold text-field-800">{value}</div>
    </div>
  )
}
