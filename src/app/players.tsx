import React, { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Avatar, Body, Button, Caption, Divider, NavHeader, Overline, Row, Screen, toastError,
} from '@/components/ui';
import { usePlayersStore } from '@/store/usePlayersStore';
import type { Player } from '@/domain/types';
import { AVATAR_PALETTE, avatarColor, colors, radius, space, TAP, textStyles } from '@/theme';

export default function PlayersScreen() {
  const router = useRouter();
  const players = usePlayersStore((s) => s.players);
  const add = usePlayersStore((s) => s.add);
  const rename = usePlayersStore((s) => s.rename);
  const setColor = usePlayersStore((s) => s.setColor);
  const setArchived = usePlayersStore((s) => s.setArchived);
  const remove = usePlayersStore((s) => s.remove);
  const [editing, setEditing] = useState<{ player: Player | null; name: string; seed: number } | null>(null);

  const safe = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      toastError(e);
    }
  };

  const active = players.filter((p) => !p.archived);
  const archived = players.filter((p) => p.archived);

  const onLongPress = (p: Player) =>
    Alert.alert(p.name, undefined, [
      { text: 'Edit', onPress: () => setEditing({ player: p, name: p.name, seed: p.colorSeed }) },
      { text: p.archived ? 'Unarchive' : 'Archive', onPress: () => safe(() => setArchived(p.id, !p.archived)) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete player?', 'Only possible if they never played a night.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => safe(() => remove(p.id)) },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const save = () => {
    if (!editing || !editing.name.trim()) return;
    safe(() => {
      const name = editing.name.trim();
      if (editing.player) {
        if (name !== editing.player.name) rename(editing.player.id, name);
        if (editing.seed !== editing.player.colorSeed) setColor(editing.player.id, editing.seed);
      } else {
        const created = add(name);
        setColor(created.id, editing.seed);
      }
      setEditing(null);
    });
  };

  const renderGroup = (list: Player[]) => (
    <View style={s.panel}>
      {list.map((p, i) => (
        <View key={p.id}>
          {i > 0 ? <Divider /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={p.name}
            onPress={() => setEditing({ player: p, name: p.name, seed: p.colorSeed })}
            onLongPress={() => onLongPress(p)}
            style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.cardAlt }]}>
            <Avatar name={p.name} seed={p.colorSeed} size={36} />
            <Text style={s.name} numberOfLines={1}>
              {p.name}
            </Text>
            <View style={{ flex: 1 }} />
            {p.archived ? <Caption tone="muted">archived</Caption> : null}
          </Pressable>
        </View>
      ))}
    </View>
  );

  return (
    <Screen scroll>
      <NavHeader
        title="Players"
        onBack={() => router.back()}
        right={
          <Button
            label="+ New"
            variant="secondary"
            size="md"
            onPress={() => setEditing({ player: null, name: '', seed: Math.floor(Math.random() * AVATAR_PALETTE.length) })}
          />
        }
      />

      {players.length === 0 ? (
        <Body dim>No players yet. Tap "+ New" to add the first one.</Body>
      ) : (
        <>
          <Caption tone="muted" style={{ marginBottom: space.sm }}>
            Tap to edit name and colour · long-press for archive and delete.
          </Caption>
          {active.length > 0 ? renderGroup(active) : null}
          {archived.length > 0 ? (
            <>
              <Overline style={{ marginTop: space.xl, marginBottom: space.sm }}>Archived</Overline>
              {renderGroup(archived)}
            </>
          ) : null}
        </>
      )}

      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={s.scrim}>
          <View style={s.dialog}>
            <Overline style={{ marginBottom: space.md }}>{editing?.player ? 'Edit player' : 'New player'}</Overline>
            <Row>
              <Avatar name={editing?.name.trim() || '?'} seed={editing?.seed ?? 0} size={44} />
              <TextInput
                value={editing?.name ?? ''}
                onChangeText={(t) => setEditing((e) => (e ? { ...e, name: t } : e))}
                autoFocus
                onSubmitEditing={save}
                placeholder="Name"
                placeholderTextColor={colors.textMuted}
                style={[s.input, { flex: 1, marginLeft: space.md }]}
                returnKeyType="done"
              />
            </Row>
            <Overline style={{ marginTop: space.lg, marginBottom: space.sm }}>Colour</Overline>
            <Row style={s.swatches}>
              {AVATAR_PALETTE.map((hex, i) => {
                const selected = editing !== null && avatarColor(editing.seed) === hex;
                return (
                  <Pressable
                    key={hex}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Colour ${i + 1}`}
                    onPress={() => setEditing((e) => (e ? { ...e, seed: i } : e))}
                    hitSlop={4}
                    style={s.swatchHit}>
                    <View style={[s.swatch, { backgroundColor: hex }, selected && s.swatchSelected]} />
                  </Pressable>
                );
              })}
            </Row>
            <Row style={{ marginTop: space.lg }}>
              <Button label="Cancel" variant="secondary" onPress={() => setEditing(null)} style={{ flex: 1, marginRight: space.sm }} />
              <Button label="Save" onPress={save} disabled={!editing?.name.trim()} style={{ flex: 1 }} />
            </Row>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  panel: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: space.md },
  name: { ...textStyles.labelMd, fontSize: 15, color: colors.text, marginLeft: space.md },
  scrim: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: space.xl },
  dialog: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: space.lg,
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
  swatches: { flexWrap: 'wrap', marginHorizontal: -space.xs },
  swatchHit: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  swatchSelected: { borderWidth: 3, borderColor: colors.text },
});
