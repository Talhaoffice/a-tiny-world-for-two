export type AppErrorCode =
  | 'permission-denied'
  | 'unauthenticated'
  | 'unavailable'
  | 'deadline-exceeded'
  | 'resource-exhausted'
  | 'failed-precondition'
  | 'invalid-argument'
  | 'cancelled'
  | 'unknown'

export type AppError = {
  code: AppErrorCode
  userMessage: string
  devMessage: string
  retryable: boolean
  cause?: unknown
}

const MESSAGES: Record<AppErrorCode, { userMessage: string; retryable: boolean }> = {
  'permission-denied': { userMessage: 'This action is not available for this account. Check island access and try again.', retryable: false },
  unauthenticated: { userMessage: 'Your sign-in has expired. Sign in again, then retry.', retryable: false },
  unavailable: { userMessage: 'The island is temporarily unreachable. Check your connection and try again.', retryable: true },
  'deadline-exceeded': { userMessage: 'The request is taking too long. Check your connection before retrying.', retryable: true },
  'resource-exhausted': { userMessage: 'The service is temporarily limiting requests. Please wait before trying again.', retryable: true },
  'failed-precondition': { userMessage: 'The island setup is incomplete. Ask the project owner to check its indexes and rules.', retryable: false },
  'invalid-argument': { userMessage: 'Some of that information is not valid. Review it and try again.', retryable: false },
  cancelled: { userMessage: 'The request was cancelled. You can try again.', retryable: true },
  unknown: { userMessage: 'We could not complete that right now. Please try again.', retryable: true },
}

const SAFE_LOCAL_MESSAGES = /^(Cloud Firestore is not configured for this app\.|Choose a valid local release date and time\.|The device time zone could not be read\. Choose a different release time\.|That local time does not exist because the clock changes\. Choose another time\.|That local time occurs twice when the clock changes\. Choose another time\.|Add a title up to 60 characters and a (description|memory) up to 300 characters\.|Notes must be between 1 and 500 characters\.|Letters must be between 1 and 2,000 characters\.|Letter titles must be between 1 and 80 characters\.|Only unopened legacy letters can be upgraded by their sender\.|Sign in again before saving this shared item\.|Only the creator can (edit|delete) this (note|keepsake|memory)\.|The letter body is unavailable\. Try again later\.|The letter body could not be read\. Ask the project owner to check the mailbox setup\.)$/

function readCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error) || typeof error.code !== 'string') return 'unknown'
  return error.code.toLowerCase().replace(/^(firestore|database|auth)\//, '').replaceAll('_', '-')
}

function safeCode(code: string): AppErrorCode {
  return Object.hasOwn(MESSAGES, code) ? code as AppErrorCode : 'unknown'
}

export function toAppError(error: unknown, fallbackMessage?: string): AppError {
  if (error && typeof error === 'object' && 'userMessage' in error && 'retryable' in error && 'code' in error) {
    return error as AppError
  }

  const rawCode = readCode(error)
  const code = safeCode(rawCode === 'network-request-failed' ? 'unavailable' : rawCode)
  const safeLocalError = error instanceof Error && rawCode === 'unknown' && SAFE_LOCAL_MESSAGES.test(error.message)
  const userMessage = safeLocalError
    ? error.message
    : fallbackMessage ?? MESSAGES[code].userMessage

  return {
    code,
    userMessage,
    devMessage: rawCode === 'unknown' ? 'Unclassified application error.' : rawCode,
    retryable: MESSAGES[code].retryable,
    cause: error,
  }
}
