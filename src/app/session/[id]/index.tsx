import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  Banner, Body, Button, Caption, NavHeader, Overline, Row, Screen, SegmentedControl, StatusPill, toastError,
} from '@/components/ui';
import { BuyinRow } from '@/components/BuyinRow';
import { CashoutRow } from '@/components/CashoutRow';
import { AmountPad } from '@/components/AmountPad';
import { ChipSheet } from '@/components/ChipSheet';
import { PlayerChecklist } from '@/components/PlayerChecklist';
import { useSessionsStore } from '@/store/useSessionsStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { usePlayersStore } from '@/store/usePlayersStore';
import { summarize } from '@/domain/nets';
import { formatCents } from '@/domain/money';
import { formatDate, fromIso, toIso } from '@/date';
import type { Buyin, Player } from '@/domain/types';
import { colors, radius, space, textStyles } from '@/theme';

type Tab = 'buyins' | 'cashout';

type PadState =
  | { kind: 'none' }
  | { kind: 'customBuyin'; spId: string; name: string }
  | { kind: 'editBuyin'; buyin: Buyin }
  | { kind: 'cashout'; spId: string; name: string; current: number | null };

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const store = useSessionsStore();
  const symbol = useSettingsStore((s) => s.settings.currencySymbol);
  const players = usePlayersStore((s) => s.players);

  const [tab, setTab] = useState<Tab>('buyins');
  const [pad, setPad] = useState<PadState>({ kind: 'none' });
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [editingNight, setEditingNight] = useState(false);
  const [chipFor, setChipFor] = useState<{ spId: string; name: string } | null>(null);
  const denoms = useSettingsStore((s) => s.denoms);

  useEffect(() => {
    if (id) store.open(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const detail = store.detail;
  const math = useMemo(() => (detail ? summarize(detail) : null), [detail]);

  if (!detail || !math || detail.session.id !== id) {
    return (
      <Screen>
        <Body dim>Loading…</Body>
      </Screen>
    );
  }

  const safe = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      toastError(e);
    }
  };
  const closePad = () => setPad({ kind: 'none' });
  const detailOf = (playerId: string) => detail.players.find((p) => p.player.id === playerId)!;
  const title = detail.session.title?.trim() ? detail.session.title : formatDate(detail.session.date);

  const onRowLongPress = (spId: string, name: string, hasBuyins: boolean) => {
    const doRemove = () => safe(() => store.removePlayer(spId));
    Alert.alert(name, undefined, [
      {
        text: 'Remove from night',
        style: 'destructive',
        onPress: () =>
          hasBuyins
            ? Alert.alert('Remove player?', 'Their buy-ins will be removed too.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: doRemove },
              ])
            : doRemove(),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const balanced = math.pendingCount === 0 && math.totalCashoutCents === math.totalBuyinCents;
  const offBy = Math.abs(math.totalCashoutCents - math.totalBuyinCents);
  const notInSession = players.filter(
    (p) => !p.archived && !detail.players.some((sp) => sp.player.id === p.id),
  );

  return (
    <Screen
      scroll
      footer={
        tab === 'buyins' ? (
          <Button label="Go to Cash-Out  →" variant="orange" onPress={() => setTab('cashout')} />
        ) : (
          <Button
            label="Settle up  →"
            onPress={() => router.push(`/session/${id}/settle`)}
            disabled={math.pendingCount > 0}
          />
        )
      }>
      <NavHeader
        overline="Active night"
        overlineTone="orange"
        dot
        title={title}
        onBack={() => router.back()}
        onTitlePress={() => setEditingNight(true)}
        right={
          <View style={s.potPool}>
            <Text style={s.potValue}>{formatCents(math.totalBuyinCents, symbol)}</Text>
            <Text style={s.potLabel}>Pot Pool</Text>
          </View>
        }
      />

      <SegmentedControl
        segments={[
          { key: 'buyins', label: 'Buy-ins' },
          { key: 'cashout', label: 'Cash-out' },
          { key: 'settle', label: 'Settle' },
        ]}
        value={tab}
        onChange={(key) => {
          if (key === 'settle') router.push(`/session/${id}/settle`);
          else setTab(key as Tab);
        }}
        style={{ marginBottom: space.md }}
      />

      {tab === 'buyins' ? (
        <>
          <Banner
            kind="info"
            text={`Tap + to log the default rebuy (${formatCents(detail.session.defaultBuyinCents, symbol)})`}
            style={{ alignItems: 'center', marginBottom: space.md }}
          />
          {math.rows.map((row) => {
            const d = detailOf(row.playerId);
            return (
              <BuyinRow
                key={row.playerId}
                row={row}
                buyins={d.buyins}
                onAddDefault={() => safe(() => store.addBuyin(d.sp.id, detail.session.defaultBuyinCents))}
                onCustomBuyin={() => setPad({ kind: 'customBuyin', spId: d.sp.id, name: row.name })}
                onEditBuyin={(b) => setPad({ kind: 'editBuyin', buyin: b })}
                onLongPress={() => onRowLongPress(d.sp.id, row.name, d.buyins.length > 0)}
              />
            );
          })}
          <Button
            label="+ Add player"
            variant="secondary"
            size="md"
            onPress={() => setAddingPlayer(true)}
            style={{ marginTop: space.sm }}
          />
          <Caption tone="muted" style={{ marginTop: space.sm }}>
            Long-press + for a custom amount · tap a pill to edit or remove it · long-press a row to
            remove the player.
          </Caption>
        </>
      ) : (
        <>
          <StatusPill
            tone={balanced ? 'ok' : 'warn'}
            label={
              math.pendingCount > 0
                ? `${math.pendingCount} still to cash out`
                : balanced
                  ? 'Balanced Pool'
                  : `Off by ${formatCents(offBy, symbol)}`
            }
            value={`${formatCents(math.totalCashoutCents, symbol)} / ${formatCents(math.totalBuyinCents, symbol)}`}
            style={{ marginBottom: space.md }}
          />
          {math.rows.map((row) => {
            const d = detailOf(row.playerId);
            return (
              <CashoutRow
                key={row.playerId}
                row={row}
                onPress={() => setPad({ kind: 'cashout', spId: d.sp.id, name: row.name, current: d.sp.cashoutCents })}
                onLongPress={() => onRowLongPress(d.sp.id, row.name, d.buyins.length > 0)}
              />
            );
          })}
          {math.pendingCount === 0 && !balanced ? (
            <Banner
              kind="warn"
              text={`Off by ${formatCents(offBy, symbol)} — ${
                math.totalCashoutCents > math.totalBuyinCents ? 'too much cashed out' : 'cash missing'
              }. Recount?`}
              style={{ marginTop: space.sm }}
            />
          ) : null}
          <Caption tone="muted" style={{ marginTop: space.sm }}>
            Tap a row to type a cash-out. Amounts stay editable after settling.
          </Caption>
        </>
      )}

      <AmountPad
        visible={pad.kind === 'customBuyin'}
        title={pad.kind === 'customBuyin' ? `Buy-in · ${pad.name}` : 'Buy-in'}
        initialCents={detail.session.defaultBuyinCents}
        onCancel={closePad}
        onConfirm={(c) => {
          if (pad.kind === 'customBuyin') safe(() => store.addBuyin(pad.spId, c));
          closePad();
        }}
      />
      <AmountPad
        visible={pad.kind === 'editBuyin'}
        title="Edit buy-in"
        initialCents={pad.kind === 'editBuyin' ? pad.buyin.amountCents : null}
        onCancel={closePad}
        onConfirm={(c) => {
          if (pad.kind === 'editBuyin') safe(() => store.updateBuyin(pad.buyin.id, c));
          closePad();
        }}
        onDelete={() => {
          if (pad.kind === 'editBuyin') safe(() => store.removeBuyin(pad.buyin.id));
          closePad();
        }}
      />
      <AmountPad
        visible={pad.kind === 'cashout'}
        title={pad.kind === 'cashout' ? `Cash-out · ${pad.name}` : 'Cash-out'}
        allowZero
        initialCents={pad.kind === 'cashout' ? pad.current : null}
        extraAction={
          denoms.length > 0 && pad.kind === 'cashout'
            ? {
                label: 'Use chips',
                onPress: () => {
                  if (pad.kind !== 'cashout') return;
                  const target = { spId: pad.spId, name: pad.name };
                  closePad();
                  setChipFor(target);
                },
              }
            : undefined
        }
        onCancel={closePad}
        onConfirm={(c) => {
          if (pad.kind === 'cashout') safe(() => store.setCashout(pad.spId, c));
          closePad();
        }}
        onDelete={
          pad.kind === 'cashout' && pad.current !== null
            ? () => {
                if (pad.kind === 'cashout') safe(() => store.setCashout(pad.spId, null));
                closePad();
              }
            : undefined
        }
      />

      <AddPlayerSheet
        visible={addingPlayer}
        candidates={notInSession}
        onClose={() => setAddingPlayer(false)}
        onPick={(playerId) => {
          safe(() => store.addPlayer(playerId));
          setAddingPlayer(false);
        }}
      />

      <EditNightSheet
        visible={editingNight}
        initialTitle={detail.session.title ?? ''}
        initialDate={detail.session.date}
        onClose={() => setEditingNight(false)}
        onSave={(next) => {
          safe(() => store.updateSession({ title: next.title.trim() || null, date: next.date }));
          setEditingNight(false);
        }}
      />

      <ChipSheet
        visible={chipFor !== null}
        playerName={chipFor?.name ?? ''}
        onCancel={() => setChipFor(null)}
        onUse={(cents) => {
          if (chipFor) safe(() => store.setCashout(chipFor.spId, cents));
          setChipFor(null);
        }}
      />
    </Screen>
  );
}

function AddPlayerSheet({
  visible,
  candidates,
  onPick,
  onClose,
}: {
  visible: boolean;
  candidates: Player[];
  onPick: (playerId: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Dismiss" />
      <View style={s.sheet}>
        <Overline style={{ marginBottom: space.md }}>Add player to this night</Overline>
        {candidates.length === 0 ? (
          <Body dim>Everyone on the roster is already in. Add new players from the Players screen.</Body>
        ) : (
          <PlayerChecklist players={candidates} selectedIds={[]} onToggle={onPick} mode="add" />
        )}
        <Button label="Done" variant="secondary" onPress={onClose} style={{ marginTop: space.sm }} />
      </View>
    </Modal>
  );
}

function EditNightSheet({
  visible,
  initialTitle,
  initialDate,
  onSave,
  onClose,
}: {
  visible: boolean;
  initialTitle: string;
  initialDate: string;
  onSave: (next: { title: string; date: string }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [date, setDate] = useState(initialDate);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setTitle(initialTitle);
      setDate(initialDate);
      setShowPicker(false);
    }
  }, [visible, initialTitle, initialDate]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Dismiss" />
      <View style={s.sheet}>
        <Overline style={{ marginBottom: space.md }}>Edit night</Overline>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Night title"
          placeholderTextColor={colors.textMuted}
          style={s.input}
          returnKeyType="done"
        />
        <Row style={{ marginTop: space.md }}>
          <Caption style={{ flex: 1 }}>Date</Caption>
          {Platform.OS === 'ios' ? (
            <DateTimePicker
              value={fromIso(date)}
              mode="date"
              display="compact"
              themeVariant="dark"
              accentColor={colors.accent}
              onChange={(_e, d) => {
                if (d) setDate(toIso(d));
              }}
            />
          ) : (
            <Button label={formatDate(date)} variant="secondary" size="md" onPress={() => setShowPicker(true)} />
          )}
        </Row>
        {showPicker && Platform.OS === 'android' ? (
          <DateTimePicker
            value={fromIso(date)}
            mode="date"
            onChange={(_e, d) => {
              setShowPicker(false);
              if (d) setDate(toIso(d));
            }}
          />
        ) : null}
        <Row style={{ marginTop: space.lg }}>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1, marginRight: space.sm }} />
          <Button label="Save" onPress={() => onSave({ title, date })} style={{ flex: 1 }} />
        </Row>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  potPool: {
    alignItems: 'flex-end',
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  potValue: { ...textStyles.numericMd, color: colors.accent },
  potLabel: { ...textStyles.labelCaps, color: colors.accent },
  scrim: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong,
    padding: space.lg,
    paddingBottom: space.xxl,
    maxHeight: '80%',
  },
  input: {
    ...textStyles.bodyLg,
    color: colors.text,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
});
