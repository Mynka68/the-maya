// Export CSV compatible Excel FR : séparateur point-virgule + BOM UTF-8
export function downloadCsv(filename: string, rows: Record<string, string | number | null | undefined>[]) {
  if (rows.length === 0) return

  const headers = Object.keys(rows[0])
  const escape = (value: string | number | null | undefined) => {
    const s = value === null || value === undefined ? '' : String(value)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const csv = '\uFEFF' + [
    headers.join(';'),
    ...rows.map(row => headers.map(h => escape(row[h])).join(';')),
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
