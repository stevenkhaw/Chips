import React from 'react';
import { View } from 'react-native';
import {
  Avatar, Banner, Body, Button, Caption, Card, ChipGlyph, Checkbox, Divider, Headline,
  Label, Overline, Pill, Row, Screen, SegmentedControl, StatTile, StatusPill, Title,
} from '@/components/ui';
import { MoneyText } from '@/components/MoneyText';
import { space } from '@/theme';

export default function Home() {
  const [tab, setTab] = React.useState<'a' | 'b'>('a');
  return (
    <Screen scroll>
      <Row style={{ marginBottom: space.lg }}>
        <ChipGlyph />
        <Headline style={{ marginLeft: space.sm }}>CHIPS</Headline>
      </Row>
      <Row style={{ marginBottom: space.md }}>
        <StatTile label="All-time nights" value="42" style={{ marginRight: space.md }} />
        <StatTile label="Total volume" value="$4,820" />
      </Row>
      <Card style={{ marginBottom: space.md }}>
        <Title>Ready to deal?</Title>
        <Caption style={{ marginTop: space.xs }}>Token preview screen.</Caption>
        <Divider style={{ marginVertical: space.md }} />
        <Row>
          <Avatar name="Ann" seed={1} />
          <Body style={{ marginLeft: space.sm }}>Ann</Body>
          <View style={{ flex: 1 }} />
          <MoneyText cents={-725} signed />
        </Row>
      </Card>
      <SegmentedControl
        segments={[{ key: 'a', label: 'Buy-ins' }, { key: 'b', label: 'Cash-out' }]}
        value={tab}
        onChange={setTab}
        style={{ marginBottom: space.md }}
      />
      <StatusPill tone="ok" label="Balanced Pool" value="$230 / $230" style={{ marginBottom: space.md }} />
      <Banner kind="warn" text="Off by $20 — recount?" style={{ marginBottom: space.md }} />
      <Row style={{ flexWrap: 'wrap' }}>
        <Pill label="$20" />
        <Pill label="$20" tone="orange" />
        <Pill label="$20" tone="muted" />
        <Checkbox checked />
      </Row>
      <Label style={{ marginTop: space.md }}>Label</Label>
      <Overline tone="orange">Active night</Overline>
      <Button label="Start New Night" onPress={() => {}} style={{ marginTop: space.md }} />
      <Button label="Go to Cash-Out  →" variant="orange" onPress={() => {}} style={{ marginTop: space.sm }} />
      <Button label="Secondary" variant="secondary" onPress={() => {}} style={{ marginTop: space.sm }} />
    </Screen>
  );
}
