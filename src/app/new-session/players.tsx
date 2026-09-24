import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button, Caption, NavHeader, Row, Screen, toastError } from '@/components/ui';
import { PlayerChecklist } from '@/components/PlayerChecklist';
import { EditorOnly } from '@/components/EditorOnly';
import { useNewNightDraft } from '@/store/useNewNightDraft';
import { usePlayersStore } from '@/store/usePlayersStore';
import { useSessionsStore } from '@/store/useSessionsStore';
import { colors, radius, space, textStyles } from '@/theme';

export default function NewSessionStep2Screen() {
  return (
    <EditorOnly fallback="/">
      <NewSessionStep2 />
    </EditorOnly>
  );
}

function NewSessionStep2() {
  const router = useRouter();
  const draft = useNewNightDraft();
  const players = usePlayersStore((s) => s.players);
  const addPlayer = usePlayersStore((s) => s.add);
  const create = useSessionsStore((s) => s.create);
  const lastPlayerIds = useSessionsStore((s) => s.lastPlayerIds);

  const roster = useMemo(() => players.filter((p) => !p.archived), [players]);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const active = new Set(players.filter((p) => !p.archived).map((p) => p.id));
    return lastPlayerIds().filter((id) => active.has(id));
  });
  const [newName, setNewName] = useState('');

  const toggle = (id: string) =>
    setSelectedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const addNew = () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const p = addPlayer(name);
      setNewName('');
      setSelectedIds((cur) => [...cur, p.id]);
    } catch (e) {
      toastError(e);
    }
  };

  const confirm = () => {
    if (selectedIds.length === 0) return;
    try {
      const session = create({
        date: draft.date,
        title: draft.title.trim() || null,
        defaultBuyinCents: draft.defaultBuyinCents,
        playerIds: selectedIds,
      });
      // Leave the two setup steps behind, then open the night, so "back" from the
      // session returns to home rather than to step 1.
      router.dismissAll();
      requestAnimationFrame(() => router.push(`/session/${session.id}`));
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Screen
      scroll
      footer={
        <Button
          label="Confirm & Start Game  →"
          variant="orange"
          onPress={confirm}
          disabled={selectedIds.length === 0}
        />
      }>
      <NavHeader
        center
        overline="Step 2 of 2"
        title="Select Players"
        onBack={() => router.back()}
        onClose={() => router.dismissAll()}
      />

      <Row style={{ marginBottom: space.lg }}>
        <TextInput
          value={newName}
          onChangeText={setNewName}
          placeholder="Add new player name..."
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={addNew}
          returnKeyType="done"
          style={s.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add player"
          onPress={addNew}
          disabled={!newName.trim()}
          style={({ pressed }) => [s.addBtn, { opacity: !newName.trim() ? 0.4 : pressed ? 0.8 : 1 }]}>
          <Text style={s.addGlyph}>+</Text>
        </Pressable>
      </Row>

      <Row style={{ marginBottom: space.md, paddingHorizontal: space.xs }}>
        <Caption>
          {selectedIds.length} of {roster.length} players selected
        </Caption>
        <View style={{ flex: 1 }} />
        <Pressable
          accessibilityRole="button"
          onPress={() => setSelectedIds([])}
          disabled={selectedIds.length === 0}
          hitSlop={8}>
          <Text style={[s.clearAll, { opacity: selectedIds.length === 0 ? 0.4 : 1 }]}>CLEAR ALL</Text>
        </Pressable>
      </Row>

      {roster.length === 0 ? (
        <Body dim>No players yet — add the first one above.</Body>
      ) : (
        <PlayerChecklist players={roster} selectedIds={selectedIds} onToggle={toggle} />
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  input: {
    ...textStyles.bodyLg,
    flex: 1,
    height: 48,
    color: colors.text,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    marginRight: space.sm,
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addGlyph: { ...textStyles.headlineMd, color: colors.text },
  clearAll: { ...textStyles.labelCaps, color: colors.orange },
});
