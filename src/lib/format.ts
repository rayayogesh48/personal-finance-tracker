import { addMonths, addWeeks, addYears, differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { Currency, DateFormat, Frequency } from './types'

const CURRENCY: Record<Currency, { symbol: string; locale: string; decimals: number }> = {
  NPR: { symbol: 'Rs.', locale: 'en-IN', decimals: 0 },
  INR: { symbol: '₹', locale: 'en-IN', decimals: 0 },
  USD: { symbol: '$', locale: 'en-US', decimals: 2 },
  GBP: { symbol: '£', locale: 'en-GB', decimals: 2 },
  EUR: { symbol: '€', locale: 'en-IE', decimals: 2 },
}

/** Module-level display config, kept in sync by the store. */
const cfg = { currency: 'NPR' as Currency, dateFormat: 'd MMM yyyy' as DateFormat }
let nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

export function configureFormat(currency: Currency, dateFormat: DateFormat) {
  if (cfg.currency !== currency) {
    const c = CURRENCY[currency]
    nf = new Intl.NumberFormat(c.locale, { minimumFractionDigits: 0, maximumFractionDigits: c.decimals })
  }
  cfg.currency = currency
  cfg.dateFormat = dateFormat
}

export const currencySymbol = () => CURRENCY[cfg.currency].symbol

/** Rs. 1,76,000 for NPR/INR (lakh grouping), $1,760.50 for USD … */
export function money(n: number, opts: { sign?: boolean } = {}) {
  const c = CURRENCY[cfg.currency]
  const v = c.decimals ? Math.round(n * 100) / 100 : Math.round(n)
  const sign = v < 0 ? '−' : opts.sign && v > 0 ? '+' : ''
  const sep = c.symbol.length > 1 ? ' ' : ''
  return `${sign}${c.symbol}${sep}${nf.format(Math.abs(v))}`
}

/** Format in a specific currency (groups have their own currency). */
export function moneyIn(n: number, currency: Currency, opts: { sign?: boolean } = {}) {
  const c = CURRENCY[currency] ?? CURRENCY.NPR
  const v = c.decimals ? Math.round(n * 100) / 100 : Math.round(n)
  const sign = v < 0 ? '−' : opts.sign && v > 0 ? '+' : ''
  const f = new Intl.NumberFormat(c.locale, { minimumFractionDigits: 0, maximumFractionDigits: c.decimals })
  return `${sign}${c.symbol}${c.symbol.length > 1 ? ' ' : ''}${f.format(Math.abs(v))}`
}

export function moneyCompact(n: number) {
  const a = Math.abs(n)
  const s = n < 0 ? '−' : ''
  const lakh = cfg.currency === 'NPR' || cfg.currency === 'INR'
  if (lakh && a >= 100000) return `${s}${+(a / 100000).toFixed(2)}L`
  if (!lakh && a >= 1_000_000) return `${s}${+(a / 1_000_000).toFixed(2)}M`
  if (a >= 1000) return `${s}${+(a / 1000).toFixed(1)}k`
  return `${s}${Math.round(a)}`
}

export const toISO = (d: Date) => format(d, 'yyyy-MM-dd')
export const todayISO = () => toISO(new Date())
/** Date in the user's chosen format */
export const fmtDate = (iso: string) => format(parseISO(iso), cfg.dateFormat)
/** Free-form pattern (for short labels like "d MMM") */
export const fmt = (iso: string, pattern: string) => format(parseISO(iso), pattern)
export const daysUntil = (iso: string) => differenceInCalendarDays(parseISO(iso), new Date())

export function relDays(iso: string) {
  const d = daysUntil(iso)
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  if (d === -1) return 'yesterday'
  return d > 0 ? `in ${d} days` : `${-d} days ago`
}

export function addFreq(iso: string, freq: Frequency, n: number) {
  const d = parseISO(iso)
  const out = freq === 'weekly' ? addWeeks(d, n) : freq === 'monthly' ? addMonths(d, n) : freq === 'quarterly' ? addMonths(d, n * 3) : freq === 'yearly' ? addYears(d, n) : d
  return toISO(out)
}

export const uid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 12)

/** Parse a user-typed amount ("1,10,000", "12.5"); NaN if invalid. */
export function parseAmount(s: string) {
  const t = s.replace(/[,\s]/g, '')
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return NaN
  return Number(t)
}
