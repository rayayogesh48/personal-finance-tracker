import type { AppData, Transaction } from './types'
import { KIND_LABEL, STATUS_LABEL } from './types'

function download(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const esc = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function exportCsv(txs: Transaction[], data: AppData, name = 'my-ullu-transactions') {
  const acc = (id?: string) => data.accounts.find((a) => a.id === id)?.name ?? ''
  const debt = (id?: string) => data.debts.find((x) => x.id === id)?.name ?? ''
  const header = ['Date', 'Title', 'Type', 'Category', 'Status', 'Reserved', 'Amount', 'Currency', 'Account', 'To account', 'Debt', 'Completed on', 'Notes']
  const rows = [...txs]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => [t.date, t.title, KIND_LABEL[t.kind], t.category, STATUS_LABEL[t.status], t.reserved ? 'Yes' : '', t.amount, data.settings.currency, acc(t.accountId), acc(t.toAccountId), debt(t.debtId), t.completedOn ?? '', t.notes ?? ''])
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n')
  download(`${name}-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + csv, 'text/csv;charset=utf-8')
}

export function exportJson(data: AppData) {
  download(`my-ullu-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json')
}
