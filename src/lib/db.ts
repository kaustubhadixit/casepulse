import { PrismaClient } from '@prisma/client'
import path from 'path'

/**
 * SQLite URL normalisation.
 *
 * Prisma resolves relative `file:` paths against the schema directory that
 * was baked in at build time — a path that does not exist on serverless
 * runtimes. We therefore resolve any relative SQLite path against the
 * CURRENT working directory before handing it to Prisma, so the same
 * `DATABASE_URL=file:./db/custom.db` works locally and inside a Vercel
 * function bundle (where ./db/custom.db is traced in by
 * outputFileTracingIncludes).
 */
function resolveSqliteUrl(): string {
  const raw = process.env.DATABASE_URL?.trim() || 'file:./db/custom.db'
  if (!raw.startsWith('file:')) return raw
  const p = raw.slice('file:'.length).trim()
  if (path.isAbsolute(p)) return `file:${p}`
  return 'file:' + path.resolve(process.cwd(), p.replace(/^\.?\//, ''))
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error'],
    datasources: { db: { url: resolveSqliteUrl() } },
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// live-engine: prisma client includes sourceId + SyncState (schema v2)
