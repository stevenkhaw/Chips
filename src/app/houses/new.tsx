import React, { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Caption, NavHeader, Overline, Screen, toastError } from '@/components/ui';
import { createHouse } from '@/store/houseActions';
import { colors, radius, space, textStyles } from '@/theme';

export default function NewHouseScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('$');

  const save = () => {
    try {
      createHouse({ name, currencySymbol: currency });
      router.back();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Screen scroll>
      <NavHeader title="New house" onBack={() => router.back()} />
      <Overline style={{ marginBottom: space.sm }}>Name</Overline>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. Tuesday Crew"
        placeholderTextColor={colors.textMuted}
        style={s.input}
        autoFocus
        returnKeyType="done"
      />
      <Overline style={{ marginTop: space.lg, marginBottom: space.sm }}>Currency symbol</Overline>
      <TextInput value={currency} onChangeText={setCurrency} style={[s.input, { width: 96 }]} maxLength={3} autoCapitalize="none" />
      <Caption tone="muted" style={{ marginTop: space.sm }}>
        Players and nights belong to one house. Your chip set and default buy-in apply to every house.
      </Caption>
      <Button label="Create house" onPress={save} style={{ marginTop: space.xl }} />
    </Screen>
  );
}

const s = StyleSheet.create({
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
