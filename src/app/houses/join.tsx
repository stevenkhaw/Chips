import React, { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Banner, Button, Caption, NavHeader, Overline, Screen } from '@/components/ui';
import { joinHouse } from '@/store/syncActions';
import { getSyncClient } from '@/sync/registry';
import { describeSyncError } from '@/sync/errors';
import { colors, radius, space, textStyles } from '@/theme';

export default function JoinHouseScreen() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const available = getSyncClient() !== null;
  const ready = code.replace(/[^A-Za-z0-9]/g, '').length === 8 && password.length > 0;

  const submit = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const r = await joinHouse(code, password, name);
      if (r.ok) {
        router.dismissTo('/');
        return;
      }
      setProblem(r.error === 'locked' ? `Too many tries. Try again in ${r.minutes} min.` : 'Code or password incorrect.');
    } catch (e) {
      setProblem(describeSyncError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <NavHeader title="Join a house" onBack={() => router.back()} />
      {!available ? <Banner kind="warn" text="Sharing isn't set up in this build." style={{ marginBottom: space.md }} /> : null}
      {problem ? <Banner kind="warn" text={problem} style={{ marginBottom: space.md }} /> : null}

      <Overline style={s.label}>Join code</Overline>
      <TextInput
        value={code}
        onChangeText={setCode}
        style={s.input}
        placeholder="K7QX-M2PA"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={9}
      />
      <Overline style={s.label}>Password</Overline>
      <TextInput value={password} onChangeText={setPassword} style={s.input} secureTextEntry autoCapitalize="none" autoCorrect={false} />
      <Overline style={s.label}>Your name (optional)</Overline>
      <TextInput value={name} onChangeText={setName} style={s.input} maxLength={40} placeholder="Shown to the owner" placeholderTextColor={colors.textMuted} />
      <Caption tone="muted" style={{ marginTop: space.sm }}>
        Ask the owner for the code and password. You'll see their nights and balances; only they can edit.
      </Caption>

      <Button
        label={busy ? 'Joining…' : 'Join house'}
        onPress={() => void submit()}
        disabled={!available || !ready || busy}
        style={{ marginTop: space.xl }}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  label: { marginTop: space.lg, marginBottom: space.sm },
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
