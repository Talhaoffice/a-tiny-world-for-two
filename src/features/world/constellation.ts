import { isValidAnnualDate } from './annualSpecialDates.ts'

export type StarPoint = { x: number; y: number }

export function constellationForDate(date: string, slot = 0): StarPoint[] {
  if (!isValidAnnualDate(date)) return []
  const [month, day] = date.split('-').map(Number)
  const seed = month * 43 + day * 17 + slot * 29
  const startX = 12 + (seed % 48)
  const startY = 13 + ((seed * 3) % 48)
  const bend = 9 + (seed % 12)
  return [
    { x: startX, y: startY },
    { x: Math.min(startX + bend, 91), y: Math.max(startY - 13, 8) },
    { x: Math.min(startX + bend * 1.6, 94), y: Math.min(startY + 8, 88) },
    { x: Math.max(startX + bend * 0.8, 6), y: Math.min(startY + 24, 92) },
  ]
}
