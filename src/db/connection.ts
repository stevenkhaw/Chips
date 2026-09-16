import type { Db } from './types';

let current: Db | null = null;

export function setDb(db: Db): void {
  current = db;
}

export function getDb(): Db {
  if (!current) throw new Error('Database not initialised. Call setDb() first.');
  return current;
}
