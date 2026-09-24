import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Banner, Body, Button, Caption, Divider, NavHeader, Overline, Pill, Row, Screen, toastError } from '@/components/ui';
import { useHousesStore } from '@/store/useHousesStore';
import { deleteHouse, renameHouse, setHouseCurrency } from '@/store/houseActions';
import {
  leaveHouse, loadMembers, removeClosedHouse, removeHouseMember, resetHousePassword, shareHouse, syncHouse,
} from '@/store/syncActions';
import { getSyncClient } from '@/sync/registry';
import { loadPassword } from '@/sync/passwords';
import { describeSyncError } from '@/sync/errors';
import type { Member } from '@/sync/remote';
import type { House } from '@/domain/types';
import { formatJoinCode } from '@/domain/joinCode';
import { copyToClipboard } from '@/share';
import { formatDate } from '@/date';
import { colors, radius, space, textStyles } from '@/theme';

const MIN_PASSWORD = 4;
const fail = (e: unknown) => toastError(new Error(describeSyncError(e).message));

export default function HouseSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const house = useHousesStore((s) => s.houses.find((h) => h.id === id) ?? null);
  const houseCount = useHousesStore((s) => s.houses.length);
  const preview = useHousesStore((s) => s.previewAsReader);
  const setPreview = useHousesStore((s) => s.setPreviewAsReader);
  const [name, setName] = useState(house?.name ?? '');
  const [currency, setCurrency] = useState(house?.currencySymbol ?? '$');

  if (!house) {
    return (
      <Screen>
        <NavHeader title="House" onBack={() => router.back()} />
        <Body dim>This house no longer exists.</Body>
      </Screen>
    );
  }

  const isOwner = house.role === 'owner';
  const changed = name.trim() !== house.name || currency.trim() !== house.currencySymbol;

  const save = () => {
    try {
      if (name.trim() !== house.name) renameHouse(house.id, name);
      if (currency.trim() !== house.currencySymbol) setHouseCurrency(house.id, currency);
    } catch (e) {
      toastError(e);
    }
  };

  const confirmDelete = () =>
    Alert.alert(
      `Delete "${house.name}"?`,
      house.published
        ? 'Its players and nights are removed from this phone. Friends keep a read-only copy marked closed. This cannot be undone.'
        : 'Its players and nights are deleted too. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            try {
              deleteHouse(house.id);
              router.back();
            } catch (e) {
              toastError(e);
            }
          },
        },
      ],
    );

  return (
    <Screen scroll>
      <NavHeader title="House" onBack={() => router.back()} />

      {house.closed ? <Banner kind="warn" text="The owner closed this house." style={{ marginBottom: space.lg }} /> : null}

      <Overline style={{ marginBottom: space.sm }}>Name</Overline>
      {isOwner ? (
        <TextInput value={name} onChangeText={setName} style={s.input} returnKeyType="done" maxLength={60} />
      ) : (
        <Body>{house.name}</Body>
      )}

      <Overline style={{ marginTop: space.lg, marginBottom: space.sm }}>Currency symbol</Overline>
      {isOwner ? (
        <TextInput value={currency} onChangeText={setCurrency} style={[s.input, { width: 96 }]} maxLength={3} autoCapitalize="none" />
      ) : (
        <Body>{house.currencySymbol}</Body>
      )}

      {isOwner ? (
        <>
          <Button label="Save" size="md" onPress={save} disabled={!changed} style={{ marginTop: space.lg }} />

          {house.published ? <SharingSection house={house} /> : <ShareSection house={house} />}

          {__DEV__ ? (
            <Row style={{ marginTop: space.xl }}>
              <Body style={{ flex: 1 }}>Preview as reader</Body>
              <Switch value={preview} onValueChange={setPreview} trackColor={{ true: colors.accent }} />
            </Row>
          ) : null}

          <Button
            label="Delete house"
            variant="danger"
            size="md"
            onPress={confirmDelete}
            disabled={houseCount <= 1}
            style={{ marginTop: space.xxl }}
          />
          {houseCount <= 1 ? (
            <Caption tone="muted" style={{ marginTop: space.sm }}>
              You need at least one house. Create another before deleting this one.
            </Caption>
          ) : null}
        </>
      ) : (
        <ReaderSection house={house} onGone={() => router.back()} />
      )}
    </Screen>
  );
}

/** Owner, not yet published: pick a password and publish. */
function ShareSection({ house }: { house: House }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const available = getSyncClient() !== null;

  const share = async () => {
    setBusy(true);
    try {
      const { joinCode } = await shareHouse(house.id, password);
      Alert.alert('Shared', `Join code ${formatJoinCode(joinCode)}. Friends need the code and your password.`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Overline style={s.section}>Share with friends</Overline>
      <Caption style={{ marginBottom: space.sm }}>
        Friends who join can see this house's nights and balances. Only you can edit.
      </Caption>
      <TextInput
        value={password}
        onChangeText={setPassword}
        style={s.input}
        placeholder={`Password (at least ${MIN_PASSWORD} characters)`}
        placeholderTextColor={colors.textMuted}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Button
        label={busy ? 'Sharing…' : 'Share house'}
        size="md"
        onPress={() => void share()}
        disabled={!available || busy || password.length < MIN_PASSWORD}
        style={{ marginTop: space.md }}
      />
      {!available ? (
        <Caption tone="muted" style={{ marginTop: space.sm }}>
          Sharing isn't set up in this build.
        </Caption>
      ) : null}
    </>
  );
}

/** Owner, published: code, password, members, sync now. */
function SharingSection({ house }: { house: House }) {
  const [saved, setSaved] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [members, setMembers] = useState<{ me: string; members: Member[] } | null>(null);
  const [membersError, setMembersError] = useState(false);

  useEffect(() => {
    void loadPassword(house.id).then(setSaved);
  }, [house.id]);

  const reloadMembers = useCallback(() => {
    setMembersError(false);
    loadMembers(house.id).then(setMembers, (e) => {
      setMembersError(true);
      fail(e);
    });
  }, [house.id]);
  useEffect(reloadMembers, [reloadMembers]);

  const copy = async (text: string, what: string) => {
    try {
      await copyToClipboard(text);
      Alert.alert('Copied', `${what} copied to the clipboard.`);
    } catch (e) {
      toastError(e);
    }
  };

  const reset = async () => {
    setResetting(true);
    try {
      await resetHousePassword(house.id, newPassword);
      setSaved(newPassword);
      setNewPassword('');
      Alert.alert('Password reset', 'Anyone joining now needs the new password. Current members stay.');
    } catch (e) {
      fail(e);
    } finally {
      setResetting(false);
    }
  };

  const confirmRemove = (m: Member) =>
    Alert.alert(`Remove ${m.display_name ?? 'this member'}?`, 'They lose access now. To keep them out, also reset the password.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeHouseMember(house.id, m.user_id).then(reloadMembers, fail),
      },
    ]);

  return (
    <>
      <Overline style={s.section}>Sharing</Overline>
      <Caption>Join code</Caption>
      <Row style={{ marginTop: space.xs }}>
        <Text style={s.code}>{house.joinCode ? formatJoinCode(house.joinCode) : '—'}</Text>
        <View style={{ flex: 1 }} />
        {house.joinCode ? (
          <Button label="Copy code" variant="secondary" size="md" onPress={() => void copy(house.joinCode!, 'Join code')} />
        ) : null}
      </Row>

      <Caption style={{ marginTop: space.lg }}>Password</Caption>
      {saved ? (
        <Row style={{ marginTop: space.xs }}>
          <Body style={{ flex: 1 }}>{shown ? saved : '••••••'}</Body>
          <Button label={shown ? 'Hide' : 'Show'} variant="ghost" size="md" onPress={() => setShown(!shown)} />
          <Button label="Copy" variant="secondary" size="md" onPress={() => void copy(saved, 'Password')} style={{ marginLeft: space.sm }} />
        </Row>
      ) : (
        <Caption tone="muted" style={{ marginTop: space.xs }}>
          Not saved on this phone. Reset it below.
        </Caption>
      )}

      <TextInput
        value={newPassword}
        onChangeText={setNewPassword}
        style={[s.input, { marginTop: space.md }]}
        placeholder="New password"
        placeholderTextColor={colors.textMuted}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Button
        label={resetting ? 'Resetting…' : 'Reset password'}
        variant="secondary"
        size="md"
        onPress={() => void reset()}
        disabled={resetting || newPassword.length < MIN_PASSWORD}
        style={{ marginTop: space.sm }}
      />

      <Overline style={s.section}>Members</Overline>
      <View style={s.panel}>
        {membersError ? (
          <Row style={s.memberRow}>
            <Caption style={{ flex: 1 }}>Couldn't load members.</Caption>
            <Button label="Retry" variant="ghost" size="md" onPress={reloadMembers} />
          </Row>
        ) : members === null ? (
          <Caption style={s.memberRow}>Loading…</Caption>
        ) : (
          members.members.map((m, i) => (
            <View key={m.user_id}>
              {i > 0 ? <Divider /> : null}
              <Row style={s.memberRow}>
                <View style={{ flex: 1 }}>
                  <Body numberOfLines={1}>{m.user_id === members.me ? 'You' : m.display_name ?? 'Anonymous member'}</Body>
                  <Caption tone="muted">joined {formatDate(m.joined_at.slice(0, 10))}</Caption>
                </View>
                <Pill label={m.role === 'owner' ? 'Owner' : 'Viewer'} tone={m.role === 'owner' ? 'default' : 'muted'} />
                {m.role === 'reader' ? (
                  <Button label="Remove" variant="ghost" size="md" onPress={() => confirmRemove(m)} style={{ marginLeft: space.sm }} />
                ) : null}
              </Row>
            </View>
          ))
        )}
      </View>

      <Button label="Sync now" variant="secondary" size="md" onPress={() => void syncHouse(house.id)} style={{ marginTop: space.lg }} />
    </>
  );
}

/** Reader: leave, or remove a closed house. */
function ReaderSection({ house, onGone }: { house: House; onGone: () => void }) {
  const [busy, setBusy] = useState(false);

  const leave = () =>
    Alert.alert(`Leave "${house.name}"?`, "You'll lose your copy of this house on this phone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await leaveHouse(house.id);
            onGone();
          } catch (e) {
            fail(e);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  const remove = async () => {
    setBusy(true);
    try {
      await removeClosedHouse(house.id);
      onGone();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Caption tone="muted" style={{ marginTop: space.lg }}>
        Only the owner can change this house.
      </Caption>
      {house.closed ? (
        <Button
          label={busy ? 'Removing…' : 'Remove from this phone'}
          variant="danger"
          size="md"
          onPress={() => void remove()}
          disabled={busy}
          style={{ marginTop: space.xxl }}
        />
      ) : (
        <Button
          label={busy ? 'Leaving…' : 'Leave house'}
          variant="danger"
          size="md"
          onPress={leave}
          disabled={busy}
          style={{ marginTop: space.xxl }}
        />
      )}
    </>
  );
}

const s = StyleSheet.create({
  section: { marginTop: space.xl, marginBottom: space.sm },
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
  code: { ...textStyles.headlineMd, color: colors.text, letterSpacing: 2 },
  panel: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  memberRow: { paddingHorizontal: space.md, paddingVertical: space.md },
});
