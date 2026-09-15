/**
 * A simple, deterministic rain-likelihood hint derived ONLY from the local
 * humidity sensor reading — not a forecast. This is deliberately a
 * different signal from the Weather card's `rain_probability` (which comes
 * from an actual weather API/forecast): humidity here reflects conditions
 * right at the farm right now, while the weather API is a forecast for the
 * area. They can disagree, and that's expected — this is not trying to
 * replace or contradict the weather forecast, just add a second, hyper-
 * local signal a farmer can see at a glance.
 *
 * Thresholds are a plain, documented heuristic (high ambient humidity is a
 * commonly-used precursor signal for rain), not a claim of meteorological
 * precision. Always shown alongside its source so it's never mistaken for
 * an official forecast.
 */
export type RainLikelihood = {
  label: string
  icon: string
  detail: string
}

export function rainLikelihoodFromHumidity(humidity: number | null | undefined): RainLikelihood | null {
  if (humidity === null || humidity === undefined || Number.isNaN(humidity)) return null

  if (humidity >= 85) {
    return { label: 'Rain likely', icon: '🌧️', detail: `Humidity sensor reads ${humidity}% — high enough that rain is likely soon.` }
  }
  if (humidity >= 70) {
    return { label: 'Rain possible', icon: '🌦️', detail: `Humidity sensor reads ${humidity}% — conditions could turn to rain.` }
  }
  if (humidity >= 50) {
    return { label: 'Low rain chance', icon: '⛅', detail: `Humidity sensor reads ${humidity}% — rain is unlikely for now.` }
  }
  return { label: 'Rain unlikely', icon: '☀️', detail: `Humidity sensor reads ${humidity}% — dry air, rain unlikely.` }
}
