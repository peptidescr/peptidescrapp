import { describe, expect, it } from 'vitest'
import { recoverStorePassword, registerStoreAccount, signUpProblem, type SignUpInput } from './accountForms'

const good: SignUpInput = {
  fullName: 'Jane Tester',
  email: 'jane@example.com',
  phone: '',
  password: 'a-long-passphrase',
  confirm: 'a-long-passphrase',
  ack: true,
  marketingOptIn: false,
}

describe('signUpProblem (UPD website\'s checks)', () => {
  it('asks for a name, a valid email, 12+ characters typed twice, and the age and research confirmation', () => {
    expect(signUpProblem(good)).toBeNull()
    expect(signUpProblem({ ...good, fullName: 'J' })).toBe('fullName')
    expect(signUpProblem({ ...good, email: 'jane@' })).toBe('email')
    expect(signUpProblem({ ...good, password: 'short', confirm: 'short' })).toBe('password')
    expect(signUpProblem({ ...good, confirm: 'a-long-passphrasf' })).toBe('confirm')
    expect(signUpProblem({ ...good, ack: false })).toBe('ack')
  })
})

describe('the account requests', () => {
  function capture(reply: () => Response) {
    const calls: { url: string; body: Record<string, unknown> }[] = []
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) })
      return reply()
    }) as unknown as typeof fetch
    return { fetchFn, calls }
  }

  it('sends sign-up to UPD with the Turnstile token, as its developer specified', async () => {
    const net = capture(() => Response.json({ data: { message: 'Check your email.' } }))
    const result = await registerStoreAccount({ ...good, email: ' jane@example.com ', marketingOptIn: true }, 'tok-1', net.fetchFn)
    expect(result).toEqual({ ok: true, message: 'Check your email.' })
    expect(net.calls[0]!.url).toBe('https://www.usapeptidedepot.com/api/customer/auth/register')
    expect(net.calls[0]!.body).toEqual({ email: 'jane@example.com', password: 'a-long-passphrase', fullName: 'Jane Tester', phone: '', marketingOptIn: true, turnstileToken: 'tok-1' })
  })

  it('sends a reset request with its own token', async () => {
    const net = capture(() => Response.json({ ok: true }))
    expect(await recoverStorePassword('jane@example.com', 'tok-2', net.fetchFn)).toEqual({ ok: true })
    expect(net.calls[0]).toEqual({ url: 'https://www.usapeptidedepot.com/api/customer/auth/recover', body: { email: 'jane@example.com', turnstileToken: 'tok-2' } })
  })

  it('passes UPD\'s refusal message on, and says when it couldn\'t be reached', async () => {
    const refused = capture(() => Response.json({ message: 'An account with this email already exists.' }, { status: 409 }))
    expect(await registerStoreAccount(good, 't', refused.fetchFn)).toEqual({ ok: false, message: 'An account with this email already exists.' })
    const offline = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect(await recoverStorePassword('jane@example.com', 't', offline)).toEqual({ ok: false, offline: true })
  })
})
