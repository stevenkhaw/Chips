import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import type { Db, SqlParam } from './types';

export function openExpoDb(name = 'chips.db'): Db {
  const sqlite: SQLiteDatabase = openDatabaseSync(name);
  sqlite.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  return {
    exec: (sql) => sqlite.execSync(sql),
    run: (sql, params: SqlParam[] = []) => {
      const r = sqlite.runSync(sql, params);
      return { changes: r.changes };
    },
    all: <T>(sql: string, params: SqlParam[] = []) => sqlite.getAllSync<T>(sql, params),
    first: <T>(sql: string, params: SqlParam[] = []) => sqlite.getFirstSync<T>(sql, params) ?? null,
    transaction: <T>(fn: () => T): T => {
      let result!: T;
      sqlite.withTransactionSync(() => {
        result = fn();
      });
      return result;
    },
  };
}
