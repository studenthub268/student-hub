import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// Lazily create the client on first use instead of at import time. A module
// import must never throw, or `next build` dies while collecting page data
// for routes that touch the DB when DATABASE_URL is absent (e.g. CI without
// secrets configured).
function makeDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Add it to .env (local) or Vercel/GitHub environment variables.'
    );
  }
  return drizzle(neon(process.env.DATABASE_URL), { schema });
}

type Db = ReturnType<typeof makeDb>;

let _db: Db | null = null;

export function getDb(): Db {
  if (!_db) _db = makeDb();
  return _db;
}

// Proxy so `import { db } from "@/lib/db"` keeps working exactly as before,
// but the real client is only constructed on the first query.
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
