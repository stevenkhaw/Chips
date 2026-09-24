import React, { useState } from 'react';
import { Alert, StyleSheet, Switch, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Body, Button, Caption, NavHeader, Overline, Row, Screen, toastError } from '@/components/ui';
import { useHousesStore } from '@/store/useHousesStore';
import { deleteHouse, renameHouse, setHouseCurrency } from '@/store/houseActions';
import { colors, radius, space, textStyles } from '@/theme';

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
    Alert.alert(`Delete "${house.name}"?`, 'Its players and nights are deleted too. This cannot be undone.', [
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
    ]);

  return (
    <Screen scroll>
      <NavHeader title="House" onBack={() => router.back()} />

      <Overline style={{ marginBottom: space.sm }}>Name</Overline>
      {isOwner ? (
        <TextInput value={name} onChangeText={setName} style={s.input} returnKeyType="done" />
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
        <Caption tone="muted" style={{ marginTop: space.lg }}>
          Only the owner can change this house.
        </Caption>
      )}
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
