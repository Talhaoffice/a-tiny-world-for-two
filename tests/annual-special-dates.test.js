import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { EMPTY_ANNUAL_SPECIAL_DATES, isAnnualSpecialDateToday, isValidAnnualDate } from '../src/features/world/annualSpecialDates.ts'

describe('annual special dates', () => {
  it('accepts valid month-and-day values without storing a year', () => {
    assert.equal(isValidAnnualDate('02-29'), true)
    assert.equal(isValidAnnualDate('12-31'), true)
    assert.equal(isValidAnnualDate('02-30'), false)
    assert.equal(isValidAnnualDate('13-01'), false)
    assert.equal(isValidAnnualDate('2026-12-31'), false)
  })

  it('matches the local month and day without creating a countdown', () => {
    const dates = { ...EMPTY_ANNUAL_SPECIAL_DATES, dateTwo: '10-25' }
    assert.equal(isAnnualSpecialDateToday(dates, new Date(2026, 9, 25, 12)), true)
    assert.equal(isAnnualSpecialDateToday(dates, new Date(2026, 9, 24, 12)), false)
  })
})
