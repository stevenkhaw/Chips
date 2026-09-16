import React from 'react';
import { Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button, NavHeader, Screen, toastError } from '@/components/ui';
import { seedStandardDenoms } from '@/chipPresets';
import { useSettingsStore } from '@/store/useSettingsStore';
import { space } from '@/theme';

export function ChipSetupSheet({
  visible,
  onSeeded,
  onCancel,
  onDismiss,
}: {
  visible: boolean;
  onSeeded: () => void;
  onCancel: () => void;
  /** iOS-only: fires once the Modal has actually finished dismissing. */
  onDismiss?: () => void;
}) {
  const router = useRouter();
  const addDenom = useSettingsStore((s) => s.addDenom);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
      onDismiss={onDismiss}>
      <Screen
        footer={
          <>
            <Button
              label="Use standard set"
              onPress={() => {
                try {
                  seedStandardDenoms(addDenom);
                  onSeeded();
                } catch (e) {
                  toastError(e);
                }
              }}
            />
            <Button
              label="Customize in Settings"
              variant="secondary"
              size="md"
              onPress={() => {
                onCancel();
                router.push('/settings');
              }}
              style={{ marginTop: space.sm }}
            />
            <Button label="Not now" variant="ghost" size="md" onPress={onCancel} style={{ marginTop: space.sm }} />
          </>
        }>
        <NavHeader overline="Chip values" overlineTone="orange" title="Set up chip values" onClose={onCancel} />
        <Body dim>Tell Chips what each colour is worth so you can count instead of typing.</Body>
      </Screen>
    </Modal>
  );
}
