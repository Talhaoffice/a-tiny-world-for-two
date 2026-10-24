import { FirebaseError } from 'firebase/app'

export function getAuthErrorMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) return 'Sign-in is unavailable right now. Please try again.'

  switch (error.code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'That email address or password could not be verified.'
    case 'auth/invalid-email':
      return 'Enter a valid email address.'
    case 'auth/too-many-requests':
      return 'Too many sign-in attempts. Please wait a little and try again.'
    case 'auth/network-request-failed':
      return 'Could not reach the sign-in service. Check your connection and try again.'
    case 'auth/operation-not-allowed':
      return 'Email and password sign-in is not enabled for this Firebase project.'
    default:
      return 'Sign-in could not be completed. Please try again.'
  }
}
