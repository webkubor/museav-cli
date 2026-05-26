// crypto.randomUUID() requires a secure context (HTTPS).
// On HTTP (e.g. local network IP), fall back to a Math.random-based UUID v4.
export function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function ok<T>(data: T) {
  return { code: 0, msg: 'ok', data, request_id: uuid() }
}

export function err(code: number, msg: string) {
  return { code, msg, data: null, request_id: uuid() }
}

export function paginate<T>(items: T[], cursor: string | null, pageSize = 20) {
  const start = cursor ? parseInt(cursor, 10) : 0
  const page = items.slice(start, start + pageSize)
  const next = start + pageSize < items.length ? String(start + pageSize) : null
  return { items: page, next_cursor: next, total: items.length }
}
