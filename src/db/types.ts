export type SqlParam = string | number | null;

export interface Db {
  exec(sql: string): void;
  run(sql: string, params?: SqlParam[]): { changes: number };
  all<T>(sql: string, params?: SqlParam[]): T[];
  first<T>(sql: string, params?: SqlParam[]): T | null;
  transaction<T>(fn: () => T): T;
}
