import React, { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import type { House } from '@/domain/types';
import { syncStatusLabel } from '@/domain/syncStatus';
import { useSyncStore } from '@/store/useSyncStore';
import { syncHouse } from '@/store/syncActions';
import { getSyncClient } from '@/sync/registry';
import { colors, space, textStyles } from '@/theme';

/** "Synced · 2m ago" / "Offline · 3 changes waiting" / "Updated 5m ago" under the house name (spec §3.4). */
export function SyncStatusLine({ house }: { house: House }) {
  const phase = useSyncStore((s) => s.byHouse[house.id]?.phase ?? 'idle');
  const message = useSyncStore((s) => s.byHouse[house.id]?.message ?? null);
  const pending = useSyncStore((s) => s.pending[house.id] ?? 0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (getSyncClient() === null) return null;

  const status = syncStatusLabel({
    role: house.role, published: house.published, closed: house.closed, phase, pending, lastSyncedAt: house.lastSyncedAt, now,
  });
  if (!status) return null;
  const color = { dim: colors.textMuted, warn: colors.orange, error: colors.neg }[status.tone];
  const displayText = status.tone === 'error' && message ? `${status.text} · ${message}` : status.text;
  const text = <Text style={[textStyles.bodySm, { color, marginTop: space.xs }]}>{displayText}</Text>;
  return status.tappable ? (
    <Pressable accessibilityRole="button" accessibilityLabel={`${displayText}. Sync now`} onPress={() => void syncHouse(house.id)}>
      {text}
    </Pressable>
  ) : (
    text
  );
}
