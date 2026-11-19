import { describe, expect, it } from 'vitest'
import { customerFrom, signInResultFor } from './session'

describe('customerFrom', () => {
  it('takes the email, and a name when the account has one', () => {
    expect(customerFrom({ email: 'jane@example.com' })).toEqual({ email: 'jane@example.com' })
    expect(customerFrom({ email: 'jane@example.com', user_metadata: { full_name: ' Jane Doe ' } })).toEqual({ email: 'jane@example.com', name: 'Jane Doe' })
    expect(customerFrom({ email: 'j@example.com', user_metadata: { first_name: 'Jane', last_name: 'Doe' } })).toEqual({ email: 'j@example.com', name: 'Jane Doe' })
    expect(customerFrom({ email: 'j@example.com', user_metadata: { first_name: '', last_name: '' } })).toEqual({ email: 'j@example.com' })
  })

  it('is null without a user or an email', () => {
    expect(customerFrom(null)).toBeNull()
    expect(customerFrom({})).toBeNull()
    expect(customerFrom({ email: '' })).toBeNull()
  })
})

describe('signInResultFor', () => {
  it('reads Supabase\'s sign-in errors', () => {
    expect(signInResultFor(null)).toBe('ok')
    expect(signInResultFor({ code: 'invalid_credentials', status: 400 })).toBe('wrong')
    expect(signInResultFor({ code: 'email_not_confirmed', status: 400 })).toBe('unconfirmed')
    expect(signInResultFor({ code: 'over_request_rate_limit', status: 429 })).toBe('busy')
    expect(signInResultFor({ name: 'AuthRetryableFetchError', status: 0 })).toBe('offline')
    expect(signInResultFor({ code: 'unexpected_failure', status: 500 })).toBe('failed')
    expect(signInResultFor({ code: 'invalid_credentials' }, false)).toBe('offline')
  })
})
