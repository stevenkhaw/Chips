import React from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Body, Button, Caption, Card, ChipGlyph, Divider, Headline, IconButton, Overline, Row, Screen, StatTile, Title, toastError,
} from '@/components/ui';
import { NightRow } from '@/components/NightRow';
import { useSessionsStore } from '@/store/useSessionsStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { formatCents } from '@/domain/money';
import { colors, radius, space, textStyles } from '@/theme';

export default function Home() {
  const router = useRouter();
  const summaries = useSessionsStore((s) => s.summaries);
  const deleteSession = useSessionsStore((s) => s.deleteSession);
  const symbol = useSettingsStore((s) => s.settings.currencySymbol);

  const totalVolumeCents = summaries.reduce((sum, x) => sum + x.totalBuyinCents, 0);
  const hasNights = summaries.length > 0;

  const onLongPress = (id: string, title: string) => {
    Alert.alert(title, undefined, [
      { text: 'Share', onPress: () => router.push(`/session/${id}/settle?share=1`) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete this night?', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                try {
                  deleteSession(id);
                } catch (e) {
                  toastError(e);
                }
              },
            },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <Screen scroll>
      <Row style={s.header}>
        <ChipGlyph />
        <Headline style={s.wordmark}>CHIPS</Headline>
        <View style={{ flex: 1 }} />
        <IconButton glyph="👤" onPress={() => router.push('/players')} accessibilityLabel="Players" variant="circle" />
        <View style={{ width: space.sm }} />
        <IconButton glyph="⚙︎" onPress={() => router.push('/settings')} accessibilityLabel="Settings" variant="circle" />
      </Row>

      {hasNights ? (
        <Row style={{ marginBottom: space.md }}>
          <StatTile label="All-time nights" value={String(summaries.length)} style={{ marginRight: space.md }} />
          <StatTile label="Total volume" value={formatCents(totalVolumeCents, symbol)} />
        </Row>
      ) : null}

      <Card style={{ marginBottom: space.xl }}>
        <Title>Ready to deal?</Title>
        <Caption style={{ marginTop: space.xs, marginBottom: space.lg }}>
          Start a new night, track buy-ins, calculate splits instantly.
        </Caption>
        <Button label="Start New Night" onPress={() => router.push('/new-session')} />
      </Card>

      {hasNights ? (
        <>
          <Overline style={{ marginBottom: space.sm, marginLeft: space.xs }}>Past nights</Overline>
          <View style={s.list}>
            {summaries.map((summary, i) => (
              <View key={summary.session.id}>
                {i > 0 ? <Divider /> : null}
                <NightRow
                  summary={summary}
                  onPress={() => router.push(`/session/${summary.session.id}`)}
                  onLongPress={() =>
                    onLongPress(summary.session.id, summary.session.title?.trim() ? summary.session.title : 'Night')
                  }
                />
              </View>
            ))}
          </View>
          <Caption tone="muted" style={{ marginTop: space.sm, marginLeft: space.xs }}>
            Long-press a night to share or delete it.
          </Caption>
        </>
      ) : (
        <Body dim>No nights yet.</Body>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { paddingTop: space.sm, paddingBottom: space.lg },
  wordmark: { ...textStyles.headlineLg, color: colors.text, letterSpacing: 2, marginLeft: space.sm },
  list: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
});
