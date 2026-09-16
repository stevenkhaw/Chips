import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, Checkbox } from '@/components/ui';
import type { Player } from '@/domain/types';
import { colors, radius, space, textStyles } from '@/theme';

export function PlayerChecklist({
  players,
  selectedIds,
  onToggle,
  mode = 'check',
}: {
  players: Player[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  mode?: 'check' | 'add';
}) {
  return (
    <View>
      {players.map((p) => {
        const checked = selectedIds.includes(p.id);
        return (
          <Pressable
            key={p.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={p.name}
            onPress={() => onToggle(p.id)}
            style={({ pressed }) => [s.row, checked && s.rowSelected, pressed && { opacity: 0.8 }]}>
            <Avatar name={p.name} seed={p.colorSeed} size={36} />
            <Text style={[s.name, !checked && mode === 'check' && { color: colors.textDim }]} numberOfLines={1}>
              {p.name}
            </Text>
            {mode === 'check' ? <Checkbox checked={checked} /> : <Text style={s.addGlyph}>+</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
  },
  rowSelected: { borderColor: colors.accentBorder, backgroundColor: colors.accentSoft },
  name: { ...textStyles.labelMd, fontSize: 15, color: colors.text, flex: 1, marginLeft: space.md },
  addGlyph: { ...textStyles.headlineMd, color: colors.orange },
});
