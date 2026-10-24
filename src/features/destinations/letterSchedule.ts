const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

type LocalParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

function formatLocalParts(formatter: Intl.DateTimeFormat, timestamp: number): LocalParts {
  const values = Object.fromEntries(formatter.formatToParts(timestamp).map(part => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  }
}

function sameParts(left: LocalParts, right: LocalParts) {
  return left.year === right.year
    && left.month === right.month
    && left.day === right.day
    && left.hour === right.hour
    && left.minute === right.minute
}

export function localDateTimeToDate(value: string, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): Date {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value)
  if (!match) throw new Error('Choose a valid local release date and time.')

  const requested: LocalParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  }
  const naiveUtc = Date.UTC(requested.year, requested.month - 1, requested.day, requested.hour, requested.minute)
  if (!sameParts({
    year: new Date(naiveUtc).getUTCFullYear(),
    month: new Date(naiveUtc).getUTCMonth() + 1,
    day: new Date(naiveUtc).getUTCDate(),
    hour: new Date(naiveUtc).getUTCHours(),
    minute: new Date(naiveUtc).getUTCMinutes(),
  }, requested)) {
    throw new Error('Choose a valid local release date and time.')
  }

  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
  } catch {
    throw new Error('The device time zone could not be read. Choose a different release time.')
  }

  const offsets = new Set<number>()
  for (let sample = naiveUtc - 36 * 60 * 60 * 1000; sample <= naiveUtc + 36 * 60 * 60 * 1000; sample += 6 * 60 * 60 * 1000) {
    const local = formatLocalParts(formatter, sample)
    offsets.add(Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) - sample)
  }

  const candidates = [...offsets]
    .map(offset => naiveUtc - offset)
    .filter(timestamp => sameParts(formatLocalParts(formatter, timestamp), requested))
  const uniqueCandidates = [...new Set(candidates)]
  if (uniqueCandidates.length === 0) {
    throw new Error('That local time does not exist because the clock changes. Choose another time.')
  }
  if (uniqueCandidates.length > 1) {
    throw new Error('That local time occurs twice when the clock changes. Choose another time.')
  }
  return new Date(uniqueCandidates[0])
}
