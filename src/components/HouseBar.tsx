import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { Pill } from '@/components/ui';
import { HouseSwitcherSheet } from '@/components/HouseSwitcherSheet';
import { useCurrentHouse, useHousesStore } from '@/store/useHousesStore';
import { colors, space, textStyles } from '@/theme';

/** Current house name + role. Tap to switch houses. */
export function HouseBar({ style }: { style?: StyleProp<ViewStyle> }) {
  const house = useCurrentHouse();
  const preview = useHousesStore((s) => s.previewAsReader);
  const [open, setOpen] = useState(false);
  if (!house) return null;
  const viewing = house.role !== 'owner' || preview;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`House ${house.name}. Switch house`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [s.bar, pressed && { opacity: 0.7 }, style]}>
        <Text style={s.name} numberOfLines={1}>
          {house.name} ▾
        </Text>
        <Pill label={viewing ? 'Viewing' : 'Owner'} tone={viewing ? 'muted' : 'default'} style={{ marginLeft: space.sm }} />
      </Pressable>
      <HouseSwitcherSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  name: { ...textStyles.bodyLg, color: colors.text, flexShrink: 1 },
});
