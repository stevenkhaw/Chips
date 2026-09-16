import { DatabaseSync } from 'node:sqlite';
import type { Db, SqlParam } from '@/db/types';
import { migrate } from '@/db/schema';

export function createTestDb(): Db {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  const db: Db = {
    exec: (sql) => sqlite.exec(sql),
    run: (sql, params: SqlParam[] = []) => {
      const r = sqlite.prepare(sql).run(...params);
      return { changes: Number(r.changes) };
    },
    all: <T>(sql: string, params: SqlParam[] = []) => sqlite.prepare(sql).all(...params) as T[],
    first: <T>(sql: string, params: SqlParam[] = []) => (sqlite.prepare(sql).get(...params) as T | undefined) ?? null,
    transaction: <T>(fn: () => T): T => {
      sqlite.exec('BEGIN');
      try {
        const r = fn();
        sqlite.exec('COMMIT');
        return r;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
  migrate(db);
  return db;
}
