import { useEffect, useState } from 'react'
import { getReportBrief } from '../services/api'
import { getUser } from '../services/api'
import { DataSourceBadge } from '../components/UI'

/**
 * Section 25 — "Generate Government Brief".
 *
 * Assembled entirely from the SAME backend functions the Funding tab uses
 * (see /api/admin/funding/report-brief) — never a separate computation that
 * could drift out of sync with the dashboard.
 *
 * PDF EXPORT: there is no server-side PDF library already in this project's
 * requirements.txt, and this build can't install a new Python package
 * without shell/network access. Rather than silently doing nothing or
 * faking a PDF, this page is a clean, print-optimised HTML page — clicking
 * "Export PDF" calls the browser's native print dialog (Ctrl/Cmd+P → Save
 * as PDF), which produces an equally good PDF with zero new dependencies.
 * The `@media print` rules below hide the on-screen-only button and expand
 * the page to fill printed paper properly.
 */
export default function GovernmentBrief() {
  const [brief, setBrief] = useState<any>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!getUser()) { setErr('Please sign in as an admin to view this brief.'); return }
    getReportBrief().then(setBrief).catch(() => setErr('Could not load the brief. Admin access required.'))
  }, [])

  if (err) return <div className="p-10 text-center text-red-600">{err}</div>
  if (!brief) return <div className="p-10 text-center text-gray-400">Assembling brief…</div>

  return (
    <div className="max-w-3xl mx-auto p-8 print:p-0 bg-white text-gray-800">
      <style>{`@media print { .no-print { display: none !important; } body { background: white; } }`}</style>

      <div className="no-print flex justify-end mb-4">
        <button onClick={() => window.print()}
          className="bg-field-700 hover:bg-field-800 text-white text-sm font-semibold px-4 py-2 rounded-xl">
          🖨️ Export PDF (Print)
        </button>
      </div>

      <div className="border-b-4 border-field-700 pb-3 mb-5">
        <p className="text-xs uppercase tracking-wide text-gray-400">Agriculture Command Center</p>
        <h1 className="text-2xl font-bold text-field-800">{brief.title}</h1>
        <p className="text-xs text-gray-400">Generated {new Date(brief.generated_at).toLocaleString()} ·
          Financial Year {brief.financial_year}</p>
      </div>

      <Section title="1. Funding">
        <p className="text-xl font-bold">{brief.funding.total_label}
          <DataSourceBadge status={brief.funding.data_status} source={brief.funding.source}
            lastUpdated={brief.funding.last_updated} />
        </p>
        <ul className="text-sm mt-2 space-y-0.5">
          {brief.funding.categories.map((c: any) => (
            <li key={c.key}>{c.label}: ₹{c.amount_cr.toLocaleString()} Cr</li>
          ))}
        </ul>
      </Section>

      <Section title="2. Scheme Performance">
        <table className="w-full text-sm">
          <thead><tr className="text-left border-b"><th>Scheme</th><th>Budget</th><th>Utilization</th><th>Status</th></tr></thead>
          <tbody>
            {brief.scheme_performance.map((s: any) => (
              <tr key={s.scheme_id} className="border-b last:border-0">
                <td className="py-1">{s.scheme_name}</td>
                <td>₹{s.budget_estimate_cr?.toLocaleString()} Cr</td>
                <td>{s.utilization_pct != null ? `${s.utilization_pct}%` : '—'}</td>
                <td><DataSourceBadge status={s.data_status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="3. Priority Districts">
        <ol className="text-sm space-y-1 list-decimal pl-5">
          {brief.priority_districts.map((d: any) => (
            <li key={d.district}>{d.district} — score {d.score ?? '—'} ({d.status})</li>
          ))}
        </ol>
      </Section>

      <Section title="4. Crop Health">
        {brief.crop_health.length > 0 ? (
          <ul className="text-sm space-y-0.5">
            {brief.crop_health.map((h: any) => (
              <li key={h.district}>{h.district}: {h.top_disease ? h.top_disease.disease : h.top_pest?.pest} — {h.severity}</li>
            ))}
          </ul>
        ) : <p className="text-sm text-gray-400">No elevated pest/disease districts this period.</p>}
      </Section>

      <Section title="5. Financial & Operational Alerts">
        <ul className="text-sm space-y-1">
          {brief.financial_alerts.map((a: any, i: number) => <li key={`f${i}`}>🔶 {a.evidence}</li>)}
          {brief.operational_alerts.map((a: any, i: number) => <li key={`o${i}`}>▪ {a.title || a.message}</li>)}
        </ul>
      </Section>

      <Section title="6. Recommended Interventions">
        <ul className="text-sm space-y-1 list-disc pl-5">
          {brief.priority_districts.filter((d: any) => d.status === 'Needs Attention').map((d: any) => (
            <li key={d.district}>{d.district}: operational/fund-utilization score is low — targeted district review recommended.</li>
          ))}
          {brief.financial_alerts.filter((a: any) => a.severity === 'CRITICAL').map((a: any, i: number) => (
            <li key={i}>{a.district}: low fund utilization — investigate release-to-utilization bottleneck.</li>
          ))}
        </ul>
      </Section>

      <p className="text-[10px] text-gray-400 mt-8 border-t pt-3">
        Figures are labelled LIVE / VERIFIED / DEMO at their source; DEMO figures are illustrative
        prototype data and must not be cited as actual government expenditure. Generated by the
        Agriculture Command Center from platform data — not independently audited.
      </p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 break-inside-avoid">
      <h2 className="text-sm font-bold text-field-700 uppercase tracking-wide mb-2">{title}</h2>
      {children}
    </div>
  )
}
