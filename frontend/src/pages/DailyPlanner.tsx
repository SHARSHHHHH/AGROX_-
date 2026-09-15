import { useEffect, useState } from 'react'
import { getDailyPlan, refreshDailyPlan, getUser } from '../services/api'
import { useLanguage } from '../contexts/LanguageContext'
import { usePageContext } from '../contexts/PageContext'
import { Card, Button } from '../components/UI'

type Task = {
  time: string
  task: string
  priority: string
  source: string
  detail?: string
}

const PERIOD_META: Record<string, { icon: string; taKey: string; enLabel: string; hiLabel: string }> = {
  morning:   { icon: '🌅', taKey: 'dailyplanner.morning',   enLabel: 'Morning',   hiLabel: 'सुबह' },
  afternoon: { icon: '☀️', taKey: 'dailyplanner.afternoon', enLabel: 'Afternoon', hiLabel: 'दोपहर' },
  evening:   { icon: '🌙', taKey: 'dailyplanner.evening',   enLabel: 'Evening',   hiLabel: 'शाम' },
}

const PRIORITY_STYLE: Record<string, string> = {
  high:   'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low:    'bg-field-100 text-field-700 border-field-200',
}

const SOURCE_ICON: Record<string, string> = {
  sensor: '📡', weather: '🌤️', satellite: '🛰️', soil: '🧪',
  market: '💰', lifecycle: '📅', general: '🌿', 'sensor+weather': '📡🌤️',
}

function getSummaryPoints(summary: string | undefined, tasks: Record<string, Task[]>): string[] {
  const lines = (summary || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)

  if (lines.length >= 5) return lines.slice(0, 5)

  // Backward-compatible fallback for plans generated before the 5-point format.
  const sentences = (summary || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)

  const taskPoints = Object.values(tasks)
    .flat()
    .sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] ?? 1) - ({ high: 0, medium: 1, low: 2 }[b.priority] ?? 1))
    .map((task) => task.task)
    .filter(Boolean)

  const combined = [...sentences, ...taskPoints]
  const unique = combined.filter((point, i) => combined.indexOf(point) === i)
  return unique.slice(0, 5)
}

export default function DailyPlanner() {
  const { language, t } = useLanguage()
  const { publish } = usePageContext()
  const user = getUser()
  const [plan, setPlan] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const lang = (language || 'en') as string

  useEffect(() => {
    getDailyPlan(lang)
      .then((p) => {
        setPlan(p)
        publish(t('nav.dailyPlanner'), p.summary || t('dailyplanner.loaded'))
      })
      .catch(() => setPlan(null))
      .finally(() => setLoading(false))
  }, [lang])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const p = await refreshDailyPlan(lang)
      setPlan(p)
    } catch {
      /* ignore */
    } finally {
      setRefreshing(false)
    }
  }

  const langLabel = (period: string) => {
    const m = PERIOD_META[period]
    if (!m) return period
    if (lang === 'ta') return t(m.taKey)
    if (lang === 'hi') return m.hiLabel
    return m.enLabel
  }

  if (loading) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-field-800 mb-1">{t('nav.dailyPlanner')}</h1>
        <div className="mt-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl h-20 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const tasks = plan?.tasks || {}
  const hasTasks = Object.values(tasks).some((arr: any) => arr?.length > 0)
  const dataSources: string[] = plan?.data_sources || []
  const periodOrder = ['morning', 'afternoon', 'evening']

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between mb-1 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-field-800">{t('nav.dailyPlanner')}</h1>
          {plan?.generated_at && (
            <p className="text-xs text-gray-500 mt-1">
              {t('dailyplanner.generated')}{' '}
              {new Date(plan.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {' · '}
              <span className="text-gray-400 capitalize">{plan.source}</span>
            </p>
          )}
        </div>
        <Button onClick={handleRefresh} disabled={refreshing}
                className="shrink-0 text-xs">
          {refreshing ? t('dailyplanner.refreshing') : `↻ ${t('dailyplanner.refresh')}`}
        </Button>
      </div>

      {/* Five-point daily summary */}
      {plan?.summary && (
        <Card className="bg-field-50/60 border-field-200 mb-5">
          <div className="flex items-start gap-2">
            <span className="text-lg mt-0.5">📋</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-field-800 mb-2">{t('nav.dailyPlanner')}</p>
              <ol className="space-y-2 list-none">
                {getSummaryPoints(plan.summary, tasks).map((point, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-field-800 leading-relaxed">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-field-700 text-white text-[10px] font-bold">
                      {idx + 1}
                    </span>
                    <span>{point}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </Card>
      )}

      {/* Data sources */}
      {dataSources.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {dataSources.map((src) => (
            <span key={src}
                  className="inline-flex items-center gap-1 text-[10px] font-medium bg-white border border-gray-200 rounded-full px-2 py-0.5 text-gray-600">
              {SOURCE_ICON[src] || '📊'} {src}
            </span>
          ))}
        </div>
      )}

      {/* Task periods */}
      {!hasTasks && (
        <Card className="text-center text-gray-500 text-sm py-8">
          {t('dailyplanner.notasks')}
        </Card>
      )}

      {periodOrder.map((period) => {
        const periodTasks: Task[] = tasks[period] || []
        if (!periodTasks.length) return null
        return (
          <div key={period} className="mb-5">
            <h2 className="text-sm font-bold text-field-800 mb-2 flex items-center gap-2">
              <span>{PERIOD_META[period]?.icon}</span>
              <span>{langLabel(period)}</span>
              <span className="text-[10px] text-gray-400 font-normal">({periodTasks.length})</span>
            </h2>
            <div className="space-y-2">
              {periodTasks.map((task, idx) => (
                <Card key={idx} className="!p-3 border-l-4 border-l-gray-200 hover:border-l-field-500 transition">
                  <div className="flex items-start gap-2.5">
                    <span className="text-xs font-mono text-gray-400 mt-0.5 shrink-0">{task.time}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-field-800 leading-snug">{task.task}</p>
                      {task.detail && (
                        <p className="text-[11px] text-gray-500 mt-1 leading-tight">{task.detail}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border
                          ${PRIORITY_STYLE[task.priority] || PRIORITY_STYLE.medium}`}>
                          {task.priority}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {SOURCE_ICON[task.source] || '📊'} {task.source}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )
      })}

      {/* Footer info */}
      <p className="text-[10px] text-gray-400 text-center mt-6">
        {t('dailyplanner.footer')}
      </p>
    </div>
  )
}