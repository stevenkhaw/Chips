import React, { useState } from 'react';
import { Alert, StyleSheet, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Banner, Button, Caption, NavHeader, Overline, Screen } from '@/components/ui';
import { buildAppLink, parseInviteUrl, type Invite } from '@/domain/invite';
import { switchHouse } from '@/store/houseActions';
import { joinHouse, joinHouseByLink } from '@/store/syncActions';
import { useHousesStore } from '@/store/useHousesStore';
import { getSyncClient } from '@/sync/registry';
import { describeSyncError } from '@/sync/errors';
import { colors, radius, space, textStyles } from '@/theme';

const NO_LONGER_VALID = 'This invite is no longer valid. Ask the owner for a new one.';
const INCOMPLETE = 'That invite link is incomplete. Ask the owner to send it again, or use the code.';

/** Route params are untrusted: re-validate them with the same rules as an incoming link. */
function inviteFromParams(h: string | undefined, s: string | undefined): Invite | null {
  if (!h || !s) return null;
  const p = parseInviteUrl(buildAppLink({ houseId: h, secret: s }));
  return p?.kind === 'invite' ? p.invite : null;
}

export default function JoinHouseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ h?: string; s?: string; bad?: string }>();
  const [invite, setInvite] = useState<Invite | null>(() => inviteFromParams(params.h, params.s));
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(() =>
    params.bad || ((params.h || params.s) && !inviteFromParams(params.h, params.s)) ? INCOMPLETE : null,
  );
  const alreadyHere = useHousesStore((st) => (invite ? st.houses.some((x) => x.id === invite.houseId) : false));
  const available = getSyncClient() !== null;
  const ready = code.replace(/[^A-Za-z0-9]/g, '').length === 8 && password.length > 0;

  const joined = (houseId: string) => {
    const house = useHousesStore.getState().houses.find((x) => x.id === houseId);
    router.dismissTo('/');
    if (house) Alert.alert('Joined', `You're now viewing "${house.name}".`);
  };

  const switchToCode = () => {
    setInvite(null);
    router.setParams({ h: undefined, s: undefined, bad: undefined });
  };

  const submitLink = async () => {
    if (!invite) return;
    setBusy(true);
    setProblem(null);
    try {
      const r = await joinHouseByLink(invite, name);
      if (r.ok) return joined(r.houseId);
      setProblem(NO_LONGER_VALID);
      switchToCode();
    } catch (e) {
      setProblem(describeSyncError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const r = await joinHouse(code, password, name);
      if (r.ok) {
        router.dismissTo('/');
        return;
      }
      setProblem(r.error === 'locked' ? `Too many tries. Try again in ${r.minutes} min.` : 'Code or password incorrect');
    } catch (e) {
      setProblem(describeSyncError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const nameField = (
    <>
      <Overline style={s.label}>Your name (optional)</Overline>
      <TextInput value={name} onChangeText={setName} style={s.input} maxLength={40} placeholder="Shown to the owner" placeholderTextColor={colors.textMuted} />
    </>
  );

  return (
    <Screen scroll>
      <NavHeader title="Join a house" onBack={() => router.back()} />
      {!available ? <Banner kind="warn" text="Sharing isn't set up in this build." style={{ marginBottom: space.md }} /> : null}
      {problem ? <Banner kind="warn" text={problem} style={{ marginBottom: space.md }} /> : null}

      {invite && alreadyHere ? (
        <>
          <Banner kind="info" text="This house is already on your phone." />
          <Button
            label="Open"
            onPress={() => {
              switchHouse(invite.houseId);
              router.dismissTo('/');
            }}
            style={{ marginTop: space.xl }}
          />
        </>
      ) : invite ? (
        <>
          <Caption>
            You've been invited to a Chips house. You'll see its nights and balances; only the owner can edit.
          </Caption>
          {nameField}
          <Button
            label={busy ? 'Joining…' : 'Join house'}
            onPress={() => void submitLink()}
            disabled={!available || busy}
            style={{ marginTop: space.xl }}
          />
          <Button label="Use a code instead" variant="ghost" size="md" onPress={switchToCode} disabled={busy} style={{ marginTop: space.md }} />
        </>
      ) : (
        <>
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
          {nameField}
          <Caption tone="muted" style={{ marginTop: space.sm }}>
            Ask the owner for the code and password. You'll see their nights and balances; only they can edit.
          </Caption>

          <Button
            label={busy ? 'Joining…' : 'Join house'}
            onPress={() => void submitCode()}
            disabled={!available || !ready || busy}
            style={{ marginTop: space.xl }}
          />
        </>
      )}
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
