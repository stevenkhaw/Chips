import type { Db } from '@/db/types';
import { newId, now } from '@/db/ids';
import { mapRow } from '@/db/map';
import type { ChipDenom, Settings } from '@/domain/types';

export function getSettings(db: Db): Settings {
  const row = db.first<{ default_buyin_cents: number; currency_symbol: string }>(
    "SELECT default_buyin_cents, currency_symbol FROM settings WHERE id = 'default'",
  );
  if (!row) throw new Error('Settings row missing');
  return { defaultBuyinCents: row.default_buyin_cents, currencySymbol: row.currency_symbol };
}

export function updateSettings(db: Db, patch: Partial<Settings>): Settings {
  const cur = getSettings(db);
  const next = { ...cur, ...patch };
  db.run("UPDATE settings SET default_buyin_cents = ?, currency_symbol = ? WHERE id = 'default'", [
    next.defaultBuyinCents,
    next.currencySymbol,
  ]);
  return next;
}

const DENOM_COLS = 'id, created_at, updated_at, deleted_at, label, color_hex, value_cents, sort_order';

function validateDenom(input: { label?: string; valueCents?: number }) {
  if (input.label !== undefined && !input.label.trim()) throw new Error('Label required');
  if (input.valueCents !== undefined && (!Number.isInteger(input.valueCents) || input.valueCents <= 0)) {
    throw new Error('Value must be positive');
  }
}

export function listChipDenoms(db: Db): ChipDenom[] {
  return db
    .all<Record<string, unknown>>(`SELECT ${DENOM_COLS} FROM chip_denoms WHERE deleted_at IS NULL ORDER BY sort_order ASC`)
    .map((r) => mapRow<ChipDenom>(r));
}

export function createChipDenom(db: Db, input: { label: string; colorHex: string; valueCents: number }): ChipDenom {
  validateDenom(input);
  const max = db.first<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM chip_denoms WHERE deleted_at IS NULL');
  const sortOrder = (max?.m ?? -1) + 1;
  const id = newId();
  const t = now();
  const label = input.label.trim();
  db.run(
    'INSERT INTO chip_denoms (id, created_at, updated_at, deleted_at, label, color_hex, value_cents, sort_order) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)',
    [id, t, t, label, input.colorHex, input.valueCents, sortOrder],
  );
  return { id, createdAt: t, updatedAt: t, deletedAt: null, label, colorHex: input.colorHex, valueCents: input.valueCents, sortOrder };
}

export function updateChipDenom(
  db: Db,
  id: string,
  patch: Partial<Pick<ChipDenom, 'label' | 'colorHex' | 'valueCents'>>,
): void {
  validateDenom(patch);
  const cur = db.first<Record<string, unknown>>(`SELECT ${DENOM_COLS} FROM chip_denoms WHERE id = ? AND deleted_at IS NULL`, [id]);
  if (!cur) throw new Error('Denomination not found');
  const d = mapRow<ChipDenom>(cur);
  const next = { ...d, ...patch, label: (patch.label ?? d.label).trim() };
  db.run('UPDATE chip_denoms SET label = ?, color_hex = ?, value_cents = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [
    next.label, next.colorHex, next.valueCents, now(), id,
  ]);
}

export function deleteChipDenom(db: Db, id: string): void {
  const t = now();
  db.run('UPDATE chip_denoms SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [t, t, id]);
}

export function reorderChipDenoms(db: Db, orderedIds: string[]): void {
  const t = now();
  db.transaction(() => {
    orderedIds.forEach((id, i) => db.run('UPDATE chip_denoms SET sort_order = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [i, t, id]));
  });
}
