import fs from 'fs'
import path from 'path'
import type { Plugin } from 'vite'

const DATA_FILE = path.resolve(process.cwd(), '.requirements.json')

export interface Requirement {
  id: string
  title: string
  priority: 'high' | 'medium' | 'low'
  status: 'pending' | 'done'
  createdAt: string
  note?: string
}

type Action =
  | { action: 'add'; title: string; priority?: Requirement['priority']; note?: string }
  | { action: 'toggle'; id: string }
  | { action: 'delete'; id: string }

function read(): Requirement[] {
  if (!fs.existsSync(DATA_FILE)) return []
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as Requirement[]
  } catch {
    return []
  }
}

function write(items: Requirement[]): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2))
}

function readBody(req: import('http').IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => resolve(body))
  })
}

export function devRequirementsPlugin(): Plugin {
  return {
    name: 'dev-requirements',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/dev/requirements', async (req, res) => {
        res.setHeader('Content-Type', 'application/json')

        if (req.method === 'GET') {
          res.statusCode = 200
          res.end(JSON.stringify(read()))
          return
        }

        if (req.method === 'POST') {
          let payload: Action
          try {
            payload = JSON.parse(await readBody(req)) as Action
          } catch {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'invalid json' }))
            return
          }

          const items = read()

          if (payload.action === 'add') {
            const item: Requirement = {
              id: `req-${Date.now()}`,
              title: payload.title.trim(),
              priority: payload.priority ?? 'medium',
              status: 'pending',
              createdAt: new Date().toISOString(),
              note: payload.note,
            }
            write([...items, item])
            res.statusCode = 201
            res.end(JSON.stringify(item))
            return
          }

          if (payload.action === 'toggle') {
            const updated = items.map((item) =>
              item.id === payload.id
                ? { ...item, status: (item.status === 'done' ? 'pending' : 'done') as Requirement['status'] }
                : item
            )
            write(updated)
            res.statusCode = 200
            res.end(JSON.stringify(updated.find((i) => i.id === payload.id)))
            return
          }

          if (payload.action === 'delete') {
            write(items.filter((item) => item.id !== payload.id))
            res.statusCode = 200
            res.end(JSON.stringify({ ok: true }))
            return
          }
        }

        res.statusCode = 405
        res.end(JSON.stringify({ error: 'method not allowed' }))
      })
    },
  }
}
