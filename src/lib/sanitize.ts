/**
 * Input sanitizing, in one place. Two layers work together:
 *
 *  - **While typing / pasting**: `sanitizeDecimal` / `sanitizeInteger` make it
 *    impossible for a numeric field to hold anything but a number, so a stray
 *    letter, emoji or pasted junk never appears in it.
 *  - **At the boundary**: `parsePositiveAmount` / `parseBoundedInteger` decide
 *    whether what's left is a usable value (rather than silently turning bad
 *    input into 0), and `sanitizeText` cleans free text before it's stored.
 *
 * React already escapes everything it renders (nothing in this app uses
 * `dangerouslySetInnerHTML`), so this isn't about HTML escaping — it's about
 * keeping stored data well-formed, bounded, and safe to export.
 */
import { parseDecimal } from './units'

/** Largest dose we accept. Far above any real dose (HCG vials are 10 000 IU); it exists to stop absurd values, not to police clinical ones. */
export const MAX_DOSE_AMOUNT = 100_000
/** Longest repeating interval / cycle length we accept, in days. */
export const MAX_DAY_COUNT = 365
export const MAX_NAME_LENGTH = 60
export const MAX_NOTES_LENGTH = 1000

/**
 * Keeps digits and at most one decimal separator ('.' or ','), for decimal
 * fields. A second separator is ignored (so "1.5." stays "1.5"), a leading
 * separator gets a "0" in front (".5" → "0.5"), and length is capped.
 */
export function sanitizeDecimal(raw: string, maxLength = 10): string {
  let out = ''
  let hasSeparator = false
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') {
      out += ch
    } else if ((ch === '.' || ch === ',') && !hasSeparator) {
      hasSeparator = true
      out += out === '' ? `0${ch}` : ch
    }
  }
  return out.slice(0, maxLength)
}

/** Keeps digits only, for whole-number fields (days, counts). */
export function sanitizeInteger(raw: string, maxLength = 3): string {
  let out = ''
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') out += ch
  }
  return out.slice(0, maxLength)
}

/** A positive, finite amount within `MAX_DOSE_AMOUNT`, or null. Never falls back to 0. */
export function parsePositiveAmount(text: string): number | null {
  const value = parseDecimal(text)
  return value !== null && value > 0 && value <= MAX_DOSE_AMOUNT ? value : null
}

/** A whole number in [min, max], or null when empty/out of range. */
export function parseBoundedInteger(text: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(text)) return null
  const value = Number(text)
  return value >= min && value <= max ? value : null
}

// Control characters, plus invisible/direction-override characters that let
// text display differently from what it contains (e.g. U+202E reverses what
// follows it, which can make one name look like another).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_KEEP_NEWLINES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g
const INVISIBLE_FORMATTING = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g

/** Single-line free text (a protocol name): no control or invisible characters, whitespace collapsed, length capped. */
export function sanitizeText(raw: string, maxLength = MAX_NAME_LENGTH): string {
  return raw
    .normalize('NFC')
    .replace(CONTROL_CHARS, ' ')
    .replace(INVISIBLE_FORMATTING, '')
    .replace(/\s+/g, ' ')
    .slice(0, maxLength)
}

/** Multi-line free text (notes): as `sanitizeText`, but line breaks and tabs are kept. */
export function sanitizeMultiline(raw: string, maxLength = MAX_NOTES_LENGTH): string {
  return raw
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS_KEEP_NEWLINES, '')
    .replace(INVISIBLE_FORMATTING, '')
    .slice(0, maxLength)
}

/**
 * Makes a text cell safe to open in a spreadsheet. A cell starting with
 * = + - @ (or a tab/CR) is executed as a formula by Excel/Sheets, so a note
 * like `=HYPERLINK(...)` in an exported CSV could run when the file is opened.
 * A leading apostrophe makes it plain text. Only for text columns — numeric
 * cells (which may legitimately be negative) must not go through this.
 */
export function csvSafeText(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
}
