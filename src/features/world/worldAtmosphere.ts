export type DayNightMode = 'auto' | 'day' | 'night'
export type DecorativeWeather = 'clear' | 'rain' | 'snow'

export function isNightAt(localHour: number, mode: DayNightMode = 'auto') {
  if (mode === 'night') return true
  if (mode === 'day') return false
  return localHour < 6 || localHour >= 19
}

export function atmosphereTint(localHour: number, mode: DayNightMode) {
  const night = isNightAt(localHour, mode)
  return night
    ? { color: 0x172842, alpha: 0.38, night: true }
    : { color: 0xe9b978, alpha: localHour < 8 || localHour >= 17 ? 0.12 : 0.025, night: false }
}
