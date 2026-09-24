import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Divider, Overline, Pill, toastError } from '@/components/ui';
import { useHousesStore } from '@/store/useHousesStore';
import { switchHouse } from '@/store/houseActions';
import { colors, radius, space, textStyles } from '@/theme';

export function HouseSwitcherSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const houses = useHousesStore((s) => s.houses);
  const currentId = useHousesStore((s) => s.currentHouseId);

  const pick = (id: string) => {
    try {
      if (id !== currentId) switchHouse(id);
      onClose();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Dismiss" />
      <View style={s.sheet}>
        <Overline style={{ marginBottom: space.md }}>Houses</Overline>
        <View style={s.list}>
          {houses.map((h, i) => (
            <View key={h.id}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: h.id === currentId }}
                onPress={() => pick(h.id)}
                style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.cardAlt }]}>
                <Text style={[s.name, h.id === currentId && { color: colors.accent }]} numberOfLines={1}>
                  {h.name}
                </Text>
                <View style={{ flex: 1 }} />
                <Pill label={h.role === 'owner' ? 'Owner' : 'Viewing'} tone={h.role === 'owner' ? 'default' : 'muted'} />
              </Pressable>
            </View>
          ))}
        </View>
        {currentId ? (
          <Button
            label="House settings"
            variant="secondary"
            size="md"
            onPress={() => {
              onClose();
              router.push(`/houses/${currentId}`);
            }}
            style={{ marginTop: space.md }}
          />
        ) : null}
        <Button
          label="+ New house"
          variant="secondary"
          size="md"
          onPress={() => {
            onClose();
            router.push('/houses/new');
          }}
          style={{ marginTop: space.sm }}
        />
        <Button
          label="Join house"
          variant="secondary"
          size="md"
          onPress={() => {
            onClose();
            router.push('/houses/join');
          }}
          style={{ marginTop: space.sm }}
        />
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
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
  list: { backgroundColor: colors.cardAlt, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md },
  name: { ...textStyles.bodyLg, color: colors.text, flexShrink: 1 },
});
