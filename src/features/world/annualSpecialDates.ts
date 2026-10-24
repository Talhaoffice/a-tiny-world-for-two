export type AnnualSpecialDates = {
  dateOne: string | null
  dateTwo: string | null
  dateThree: string | null
  dateFour: string | null
  dateFive: string | null
}

export const EMPTY_ANNUAL_SPECIAL_DATES: AnnualSpecialDates = {
  dateOne: null,
  dateTwo: null,
  dateThree: null,
  dateFour: null,
  dateFive: null,
}

export function isValidAnnualDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return false
  const [month, day] = value.split('-').map(Number)
  return day <= new Date(Date.UTC(2024, month, 0)).getUTCDate()
}

export function isAnnualSpecialDateToday(dates: AnnualSpecialDates, today = new Date()) {
  const monthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return Object.values(dates).includes(monthDay)
}
