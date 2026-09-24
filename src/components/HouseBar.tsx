import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Pill } from '@/components/ui';
import { HouseSwitcherSheet } from '@/components/HouseSwitcherSheet';
import { SyncStatusLine } from '@/components/SyncStatusLine';
import { useCanEdit, useCurrentHouse } from '@/store/useHousesStore';
import { colors, space, textStyles } from '@/theme';

/** Current house name + role. Tap to switch houses. */
export function HouseBar({ style }: { style?: StyleProp<ViewStyle> }) {
  const house = useCurrentHouse();
  const canEdit = useCanEdit();
  const [open, setOpen] = useState(false);
  if (!house) return null;
  const viewing = !canEdit;
  return (
    <View style={[s.wrap, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`House ${house.name}. Switch house`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [s.bar, pressed && { opacity: 0.7 }]}>
        <Text style={s.name} numberOfLines={1}>
          {house.name} ▾
        </Text>
        <Pill label={viewing ? 'Viewing' : 'Owner'} tone={viewing ? 'muted' : 'default'} style={{ marginLeft: space.sm }} />
      </Pressable>
      <SyncStatusLine house={house} />
      <HouseSwitcherSheet visible={open} onClose={() => setOpen(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignSelf: 'flex-start' },
  bar: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  name: { ...textStyles.bodyLg, color: colors.text, flexShrink: 1 },
});
