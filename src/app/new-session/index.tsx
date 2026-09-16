import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Button, Caption, NavHeader, Overline, Row, Screen } from '@/components/ui';
import { AmountPad } from '@/components/AmountPad';
import { useNewNightDraft } from '@/store/useNewNightDraft';
import { useSettingsStore } from '@/store/useSettingsStore';
import { formatCents } from '@/domain/money';
import { formatDate, fromIso, toIso, todayIso } from '@/date';
import { colors, radius, space, textStyles } from '@/theme';

const PRESETS = [1000, 2000, 5000];

export default function NewSessionStep1() {
  const router = useRouter();
  const settings = useSettingsStore((s) => s.settings);
  const draft = useNewNightDraft();
  const [showPicker, setShowPicker] = useState(false);
  const [showPad, setShowPad] = useState(false);

  useEffect(() => {
    draft.start({ date: todayIso(), defaultBuyinCents: settings.defaultBuyinCents });
    // Runs once per visit to step 1; the draft is deliberately reset each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isCustom = draft.date !== '' && !PRESETS.includes(draft.defaultBuyinCents);
  const canContinue = draft.date !== '' && draft.defaultBuyinCents > 0;

  return (
    <Screen
      scroll
      footer={
        <Button
          label="Select Players  →"
          onPress={() => router.push('/new-session/players')}
          disabled={!canContinue}
        />
      }>
      <NavHeader
        center
        overline="Step 1 of 2"
        title="New Night"
        onBack={() => router.back()}
        onClose={() => router.dismissAll()}
      />

      <Overline style={s.label}>Night title</Overline>
      <TextInput
        value={draft.title}
        onChangeText={(t) => draft.patch({ title: t })}
        placeholder="Dave's place"
        placeholderTextColor={colors.textMuted}
        style={s.field}
        returnKeyType="done"
      />
      <Caption style={{ marginTop: space.xs }}>Optional. Falls back to the date.</Caption>

      <Overline style={s.label}>Game date</Overline>
      <Pressable
        accessibilityRole="button"
        onPress={() => setShowPicker(true)}
        style={({ pressed }) => [s.field, s.fieldRow, pressed && { backgroundColor: colors.cardAlt }]}>
        <Text style={s.fieldText}>{draft.date ? formatDate(draft.date) : ''}</Text>
        <Text style={s.calendarGlyph}>🗓</Text>
      </Pressable>

      <Overline style={s.label}>Default buy-in</Overline>
      <Row style={{ gap: space.sm }}>
        {PRESETS.map((cents) => {
          const active = draft.defaultBuyinCents === cents;
          return (
            <Pressable
              key={cents}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => draft.patch({ defaultBuyinCents: cents })}
              style={({ pressed }) => [s.preset, active && s.presetActive, pressed && { opacity: 0.85 }]}>
              <Text style={[s.presetLabel, active && { color: colors.onAccent }]}>
                {formatCents(cents, settings.currencySymbol)}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ selected: isCustom }}
          onPress={() => setShowPad(true)}
          style={({ pressed }) => [s.preset, isCustom && s.presetActive, pressed && { opacity: 0.85 }]}>
          <Text style={[s.presetLabel, isCustom && { color: colors.onAccent }]}>
            {isCustom ? formatCents(draft.defaultBuyinCents, settings.currencySymbol) : 'Custom'}
          </Text>
        </Pressable>
      </Row>
      <Caption style={{ marginTop: space.sm }}>
        Tapping + on a player during the night logs this amount instantly.
      </Caption>

      {showPicker && Platform.OS === 'android' ? (
        <DateTimePicker
          value={fromIso(draft.date || todayIso())}
          mode="date"
          onChange={(_e, d) => {
            setShowPicker(false);
            if (d) draft.patch({ date: toIso(d) });
          }}
        />
      ) : null}

      <Modal
        visible={showPicker && Platform.OS === 'ios'}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPicker(false)}>
        <Pressable style={s.scrim} onPress={() => setShowPicker(false)} accessibilityLabel="Dismiss" />
        <View style={s.sheet}>
          <Overline style={{ marginBottom: space.sm }}>Game date</Overline>
          <DateTimePicker
            value={fromIso(draft.date || todayIso())}
            mode="date"
            display="inline"
            themeVariant="dark"
            accentColor={colors.accent}
            onChange={(_e, d) => {
              if (d) draft.patch({ date: toIso(d) });
            }}
          />
          <Button label="Done" onPress={() => setShowPicker(false)} style={{ marginTop: space.md }} />
        </View>
      </Modal>

      <AmountPad
        visible={showPad}
        title="Custom buy-in"
        initialCents={draft.defaultBuyinCents}
        confirmLabel="Use amount"
        onCancel={() => setShowPad(false)}
        onConfirm={(c) => {
          draft.patch({ defaultBuyinCents: c });
          setShowPad(false);
        }}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  label: { marginTop: space.xl, marginBottom: space.sm },
  field: {
    ...textStyles.bodyLg,
    color: colors.text,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 52,
  },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldText: { ...textStyles.bodyLg, color: colors.text },
  calendarGlyph: { ...textStyles.bodyLg, color: colors.textDim },
  preset: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  presetLabel: { ...textStyles.labelMd, fontSize: 14, color: colors.text },
  scrim: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong,
    padding: space.lg,
    paddingBottom: space.xxl,
  },
});
