import { buildHistoryCsv, buildHistoryShareText } from './share';
import { buildHistory } from './domain/history';
import type { Buyin, Player, SessionDetail, SessionPlayer } from './domain/types';

const base = { createdAt: 0, updatedAt: 0, deletedAt: null };
const player = (id: string, name: string, colorSeed = 1): Player => ({ ...base, id, name, colorSeed, archived: false });
const sp = (sessionId: string, playerId: string, cashoutCents: number | null, sortOrder: number): SessionPlayer => ({
  ...base, id: `${sessionId}-${playerId}`, sessionId, playerId, cashoutCents, sortOrder,
});
const buyin = (sessionPlayerId: string, amountCents: number): Buyin => ({
  ...base, id: `${sessionPlayerId}-b${amountCents}`, sessionPlayerId, amountCents, at: 0,
});
const night = (
  id: string,
  date: string,
  title: string | null,
  rows: { p: Player; buyin: number; cashout: number | null }[],
): SessionDetail => ({
  session: { ...base, id, date, title, defaultBuyinCents: 2000, notes: null },
  players: rows.map((r, i) => {
    const s = sp(id, r.p.id, r.cashout, i);
    return { sp: s, player: r.p, buyins: [buyin(s.id, r.buyin)] };
  }),
  payments: [],
});

const ann = player('p1', 'Ann', 0);
const bob = player('p2', 'Bob', 3);
const cat = player('p3', 'Cat', 5);

describe('buildHistoryCsv', () => {
  it('emits a header, oldest-first rows, and a Total row', () => {
    const n1 = night('s1', '2026-09-01', 'Night A', [
      { p: ann, buyin: 2000, cashout: 5000 },
      { p: bob, buyin: 2000, cashout: 0 },
    ]);
    const n2 = night('s2', '2026-09-08', 'Night B', [
      { p: ann, buyin: 2000, cashout: 1000 },
      { p: bob, buyin: 4000, cashout: 6000 },
    ]);
    const h = buildHistory([n1, n2]);
    const csv = buildHistoryCsv(h);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('Night,Date,Ann,Bob');
    expect(lines[1]).toBe('Night A,2026-09-01,30.00,-20.00');
    expect(lines[2]).toBe('Night B,2026-09-08,-10.00,20.00');
    expect(lines[3]).toBe('Total,,20.00,0.00');
    expect(csv.endsWith('\n')).toBe(false); // no trailing blank line beyond the final \n join
  });

  it('leaves blank cells for absent or pending players', () => {
    const n1 = night('s1', '2026-09-01', 'N1', [
      { p: ann, buyin: 2000, cashout: 3000 },
      { p: cat, buyin: 2000, cashout: 2000 },
    ]);
    const n2 = night('s2', '2026-09-08', 'N2', [{ p: ann, buyin: 2000, cashout: null }]);
    const h = buildHistory([n1, n2]);
    const csv = buildHistoryCsv(h);
    const lines = csv.split('\n');
    // players sorted by total net desc: Ann (1000, pending unchanged), Cat (0)... check header order via h.players
    const header = lines[0].split(',');
    expect(header[0]).toBe('Night');
    expect(header[1]).toBe('Date');
    const annCol = header.indexOf('Ann');
    const catCol = header.indexOf('Cat');
    const row2 = lines[2].split(',');
    expect(row2[annCol]).toBe(''); // Ann pending on night 2
    const row1 = lines[1].split(',');
    expect(row1[catCol]).toBe('0.00');
    // Cat absent on night 2
    expect(row2[catCol]).toBe('');
  });

  it('formats negative and decimal amounts as plain decimals', () => {
    const n1 = night('s1', '2026-09-01', 'N1', [{ p: ann, buyin: 2050, cashout: 1025 }]);
    const h = buildHistory([n1]);
    const csv = buildHistoryCsv(h);
    const lines = csv.split('\n');
    expect(lines[1]).toBe('N1,2026-09-01,-10.25');
    expect(lines[2]).toBe('Total,,-10.25');
  });

  it('quotes a player name with a comma and a title containing a quote (RFC 4180)', () => {
    const weird = player('p9', 'Smith, Jr.', 2);
    const n1 = night('s1', '2026-09-01', 'Bob\'s "Big" Night', [{ p: weird, buyin: 2000, cashout: 2500 }]);
    const h = buildHistory([n1]);
    const csv = buildHistoryCsv(h);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Night,Date,"Smith, Jr."');
    expect(lines[1]).toBe('"Bob\'s ""Big"" Night",2026-09-01,5.00');
  });

  it('quotes a title containing a carriage return (RFC 4180)', () => {
    const n1 = night('s1', '2026-09-01', 'Line one\r\nLine two', [{ p: ann, buyin: 2000, cashout: 2500 }]);
    const h = buildHistory([n1]);
    const csv = buildHistoryCsv(h);
    const lines = csv.split('\n');
    // The quoted field itself contains a literal \r\n, so splitting on '\n' alone still
    // shows the row starting with the opening quote.
    expect(lines[1].startsWith('"Line one\r')).toBe(true);
  });
});

describe('buildHistoryShareText', () => {
  const n1 = night('s1', '2026-09-01', 'Opening Night', [
    { p: ann, buyin: 2000, cashout: 5000 },
    { p: bob, buyin: 2000, cashout: 0 },
    { p: cat, buyin: 2000, cashout: 2000 },
  ]);
  const n2 = night('s2', '2026-09-08', 'Second Night', [
    { p: ann, buyin: 2000, cashout: null },
    { p: bob, buyin: 4000, cashout: 6000 },
  ]);
  const h = buildHistory([n1, n2]);

  it('lists standings in the history order (by total net desc)', () => {
    const text = buildHistoryShareText(h, '$');
    const standingsBlock = text.split('\n\n')[0];
    const annIdx = standingsBlock.indexOf('Ann');
    const bobIdx = standingsBlock.indexOf('Bob');
    expect(annIdx).toBeGreaterThanOrEqual(0);
    expect(bobIdx).toBeGreaterThan(annIdx);
  });

  it('shows pending nets as "pending" and omits absent players from a night line', () => {
    const text = buildHistoryShareText(h, '$');
    const lines = text.split('\n');
    const nightLine = lines.find((l) => l.includes('pending'));
    expect(nightLine).toBeDefined();
    expect(nightLine).toContain('Ann');
    expect(nightLine).toContain('pending');
  });

  it('omits a player from a night line they did not attend', () => {
    const text = buildHistoryShareText(h, '$');
    const lines = text.split('\n');
    const openingLine = lines.find((l) => l.includes('Opening Night'))!;
    const secondLine = lines.find((l) => l.includes('Second Night'))!;
    expect(openingLine).toContain('Cat'); // Cat played night 1
    expect(secondLine).not.toContain('Cat'); // ...but not night 2
  });

  it('shows newest nights first', () => {
    const text = buildHistoryShareText(h, '$');
    const idxNewest = text.indexOf('Second Night');
    const idxOldest = text.indexOf('Opening Night');
    expect(idxNewest).toBeGreaterThanOrEqual(0);
    expect(idxOldest).toBeGreaterThan(idxNewest);
  });
});
