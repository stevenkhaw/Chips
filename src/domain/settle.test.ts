import { settle, Net } from './settle';

const n = (playerId: string, netCents: number): Net => ({ playerId, netCents });

function assertSettles(nets: Net[], transfers: { from: string; to: string; amountCents: number }[]) {
  // applying transfers to nets must zero everyone (when books balance)
  const bal = new Map(nets.map((x) => [x.playerId, x.netCents]));
  for (const t of transfers) {
    bal.set(t.from, (bal.get(t.from) ?? 0) + t.amountCents);
    bal.set(t.to, (bal.get(t.to) ?? 0) - t.amountCents);
  }
  for (const [, v] of bal) expect(v).toBe(0);
}

describe('settle', () => {
  it('empty input', () => {
    expect(settle([])).toEqual({ transfers: [], discrepancyCents: 0 });
  });

  it('single zero player', () => {
    expect(settle([n('a', 0)])).toEqual({ transfers: [], discrepancyCents: 0 });
  });

  it('all zero', () => {
    expect(settle([n('a', 0), n('b', 0)]).transfers).toEqual([]);
  });

  it('two players', () => {
    const r = settle([n('a', 2000), n('b', -2000)]);
    expect(r.transfers).toEqual([{ from: 'b', to: 'a', amountCents: 2000 }]);
    expect(r.discrepancyCents).toBe(0);
  });

  it('one winner, three losers → 3 transfers', () => {
    const nets = [n('w', 6000), n('x', -1000), n('y', -2000), n('z', -3000)];
    const r = settle(nets);
    expect(r.transfers).toHaveLength(3);
    assertSettles(nets, r.transfers);
  });

  it('greedy alone is suboptimal; subset phase finds 3 transfers', () => {
    // A +20, B +15, C -10, D -10, E -15. Greedy gives 4. Optimal: B<-E, then A<-C,D = 3.
    const nets = [n('A', 2000), n('B', 1500), n('C', -1000), n('D', -1000), n('E', -1500)];
    const r = settle(nets);
    expect(r.transfers).toHaveLength(3);
    assertSettles(nets, r.transfers);
    expect(r.transfers).toContainEqual({ from: 'E', to: 'B', amountCents: 1500 });
  });

  it('zero-net players never appear in transfers', () => {
    const r = settle([n('a', 500), n('zero', 0), n('b', -500)]);
    for (const t of r.transfers) {
      expect(t.from).not.toBe('zero');
      expect(t.to).not.toBe('zero');
    }
  });

  it('positive discrepancy (too much cash out) reported, residual not transferred', () => {
    const r = settle([n('a', 3000), n('b', -2000)]);
    expect(r.discrepancyCents).toBe(1000);
    expect(r.transfers).toEqual([{ from: 'b', to: 'a', amountCents: 2000 }]);
  });

  it('negative discrepancy (missing cash) reported', () => {
    const r = settle([n('a', 2000), n('b', -3000)]);
    expect(r.discrepancyCents).toBe(-1000);
    expect(r.transfers).toEqual([{ from: 'b', to: 'a', amountCents: 2000 }]);
  });

  it('13 non-zero players falls back to greedy and still settles', () => {
    const nets: Net[] = [];
    for (let i = 0; i < 12; i++) nets.push(n(`l${i}`, -100 * (i + 1)));
    const total = nets.reduce((s, x) => s + x.netCents, 0);
    nets.push(n('big', -total));
    const r = settle(nets);
    expect(r.discrepancyCents).toBe(0);
    expect(r.transfers.length).toBeLessThanOrEqual(12);
    assertSettles(nets, r.transfers);
  });

  it('deterministic: same input twice gives identical output', () => {
    const nets = [n('a', 1000), n('b', 1000), n('c', -1000), n('d', -1000)];
    expect(settle(nets)).toEqual(settle(nets));
  });

  it('ties broken by input order', () => {
    const r = settle([n('a', 1000), n('b', 1000), n('c', -1000), n('d', -1000)]);
    expect(r.transfers).toEqual([
      { from: 'c', to: 'a', amountCents: 1000 },
      { from: 'd', to: 'b', amountCents: 1000 },
    ]);
  });
});
