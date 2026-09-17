import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { Caption, Row } from '@/components/ui';
import { fromIso } from '@/date';
import type { History } from '@/domain/history';
import { useSessionsStore } from '@/store/useSessionsStore';
import { EVEN_COLOR } from '@/domain/playerColor';
import { colors, fonts, space } from '@/theme';

const BASE_HEIGHT = 220;
const BASE_PAD = { top: 14, right: 64, bottom: 26, left: 8 };
const BASE_LABEL_GAP = 12;

/** Axis money: "+$1.2k" / "-$40" / "$0". */
function compactMoney(cents: number, symbol: string): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '-' : '';
  const d = Math.abs(cents) / 100;
  const body = d >= 1000 ? `${(d / 1000).toFixed(d >= 10000 ? 0 : 1)}k` : String(Math.round(d));
  return `${sign}${symbol}${body}`;
}

/** 1/2/5 × 10^k dollars, chosen so the range yields ~4 gridlines. */
function niceStep(rangeCents: number): number {
  const raw = rangeCents / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  for (const m of [1, 2, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

function shortDate(iso: string): string {
  return fromIso(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * `scale` multiplies every pixel dimension (height, padding, fonts, strokes) so the
 * same chart renders crisply inside a 1080px share card. `legend` hides the legend
 * and hint text when the surrounding card already explains them.
 */
export function BalanceChart({
  history,
  symbol,
  scale = 1,
  legend = true,
}: {
  history: History;
  symbol: string;
  scale?: number;
  legend?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const { nights, players } = history;
  const playerColorMap = useSessionsStore((s) => s.playerColors);
  const colorOf = (pid: string) => playerColorMap[pid] ?? EVEN_COLOR;
  const n = nights.length;
  const HEIGHT = BASE_HEIGHT * scale;
  const PAD = {
    top: BASE_PAD.top * scale,
    right: BASE_PAD.right * scale,
    bottom: BASE_PAD.bottom * scale,
    left: BASE_PAD.left * scale,
  };
  const LABEL_GAP = BASE_LABEL_GAP * scale;
  const font = 10 * scale;

  const plotW = Math.max(width - PAD.left - PAD.right, 0);
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  const values = players.flatMap((p) => p.cumulative.filter((v): v is number => v !== null));
  let yMin = Math.min(0, ...values);
  let yMax = Math.max(0, ...values);
  if (yMax === yMin) yMax = yMin + 10000;
  const step = niceStep(yMax - yMin);
  yMin = Math.floor(yMin / step) * step;
  yMax = Math.ceil(yMax / step) * step;

  const x = (i: number) => PAD.left + ((i + 1) * plotW) / n; // i = -1 is the "start" slot
  const y = (v: number) => PAD.top + ((yMax - v) / (yMax - yMin)) * plotH;

  const ticks: number[] = [];
  for (let v = yMin; v <= yMax; v += step) ticks.push(v);

  const labelEvery = n <= 4 ? 1 : Math.ceil(n / 4);
  const xLabels = nights.map((nt, i) => i).filter((i) => i === n - 1 || i % labelEvery === 0);

  const series = players.map((p) => {
    const pts: { x: number; y: number }[] = [{ x: x(-1), y: y(0) }];
    p.cumulative.forEach((v, i) => {
      if (v !== null) pts.push({ x: x(i), y: y(v) });
    });
    return { player: p, color: colorOf(p.playerId), pts, last: pts[pts.length - 1] };
  });

  // Direct end labels: nudge apart so names never overlap.
  const labels = [...series]
    .sort((a, b) => a.last.y - b.last.y)
    .reduce<{ key: string; name: string; y: number }[]>((acc, s) => {
      const prev = acc[acc.length - 1];
      const yy = prev ? Math.max(s.last.y, prev.y + LABEL_GAP) : s.last.y;
      acc.push({ key: s.player.playerId, name: s.player.name, y: yy });
      return acc;
    }, []);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && n > 0 ? (
        <Svg width={width} height={HEIGHT} accessibilityLabel="Cumulative balance per player over nights">
          {ticks.map((v) => (
            <G key={v}>
              <Line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={y(v)}
                y2={y(v)}
                stroke={v === 0 ? colors.textMuted : colors.border}
                strokeWidth={1 * scale}
                strokeDasharray={v === 0 ? `${4 * scale} ${4 * scale}` : undefined}
              />
              <SvgText
                x={PAD.left + plotW + 6 * scale}
                y={y(v) + 3.5 * scale}
                fill={colors.textMuted}
                fontSize={font}
                fontFamily={fonts.bodySemi}>
                {compactMoney(v, symbol)}
              </SvgText>
            </G>
          ))}
          {xLabels.map((i) => (
            <SvgText
              key={nights[i].session.id}
              x={x(i)}
              y={HEIGHT - 8 * scale}
              fill={colors.textMuted}
              fontSize={font}
              fontFamily={fonts.bodySemi}
              textAnchor={i === n - 1 ? 'end' : 'middle'}>
              {shortDate(nights[i].session.date)}
            </SvgText>
          ))}
          {series.map((s) => (
            <G key={s.player.playerId}>
              <Polyline
                points={s.pts.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={s.color}
                strokeWidth={2 * scale}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.pts.slice(1).map((p, i) => (
                <Circle key={i} cx={p.x} cy={p.y} r={3.5 * scale} fill={s.color} stroke={colors.card} strokeWidth={2 * scale} />
              ))}
            </G>
          ))}
          {labels.map((l) => (
            <SvgText
              key={l.key}
              x={PAD.left + plotW + 6 * scale}
              y={l.y + 3.5 * scale}
              fill={colors.textDim}
              fontSize={font}
              fontFamily={fonts.bodyBold}>
              {l.name}
            </SvgText>
          ))}
        </Svg>
      ) : (
        <View style={{ height: HEIGHT }} />
      )}
      {legend ? (
        <>
          <Row style={s.legend}>
            {players.map((p) => (
              <Row key={p.playerId} style={s.legendItem}>
                <View style={[s.dot, { backgroundColor: colorOf(p.playerId) }]} />
                <Caption>{p.name}</Caption>
              </Row>
            ))}
          </Row>
          <Text style={s.hint}>Running total after each night. Lines pause while a cash-out is pending.</Text>
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  legend: { flexWrap: 'wrap', marginTop: space.sm },
  legendItem: { marginRight: space.md, marginBottom: space.xs },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: space.xs },
  hint: { fontFamily: fonts.body, fontSize: 11, lineHeight: 14, color: colors.textMuted, marginTop: space.xs },
});
