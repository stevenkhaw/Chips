import { OVERLAP_MS, ZERO_UUID, normalizeTimestamp, overlapStart, parseCursors, serializeCursors } from './cursor';

describe('pull cursors', () => {
  it('round-trips and tolerates junk', () => {
    const c = { players: { ts: '2026-09-24T12:00:00.123456+00:00', id: 'abc' } };
    expect(parseCursors(serializeCursors(c))).toEqual(c);
    expect(parseCursors(null)).toEqual({});
    expect(parseCursors('not json')).toEqual({});
    expect(parseCursors('[1,2]')).toEqual({});
  });

  it('starts from the beginning when there is no cursor', () => {
    expect(overlapStart(undefined)).toEqual({ ts: '1970-01-01T00:00:00.000Z', id: ZERO_UUID });
  });

  it('backs off OVERLAP_MS and handles microsecond timestamps', () => {
    const start = overlapStart({ ts: '2026-09-24T12:00:05.123456+00:00', id: 'last' });
    expect(OVERLAP_MS).toBe(5000);
    expect(start).toEqual({ ts: '2026-09-24T12:00:00.123Z', id: ZERO_UUID });
  });

  it('falls back to the beginning on an unparseable timestamp', () => {
    expect(overlapStart({ ts: 'garbage', id: 'x' })).toEqual({ ts: '1970-01-01T00:00:00.000Z', id: ZERO_UUID });
  });

  it('normalizes the fraction to exactly 3 digits and keeps the offset', () => {
    expect(normalizeTimestamp('2026-09-24T12:00:05.1+00:00')).toBe('2026-09-24T12:00:05.100+00:00');
    expect(normalizeTimestamp('2026-09-24T12:00:05.12+00:00')).toBe('2026-09-24T12:00:05.120+00:00');
    expect(normalizeTimestamp('2026-09-24T12:00:05.123456+00:00')).toBe('2026-09-24T12:00:05.123+00:00');
    expect(normalizeTimestamp('2026-09-24T12:00:05+00:00')).toBe('2026-09-24T12:00:05.000+00:00');
    expect(normalizeTimestamp('2026-09-24T12:00:05Z')).toBe('2026-09-24T12:00:05.000Z');
    expect(normalizeTimestamp('2026-09-24T12:00:05.5-07:00')).toBe('2026-09-24T12:00:05.500-07:00');
  });

  it('backs off from short, missing and long fractions', () => {
    const at = (ts: string) => overlapStart({ ts, id: 'last' }).ts;
    expect(at('2026-09-24T12:00:05.1+00:00')).toBe('2026-09-24T12:00:00.100Z');
    expect(at('2026-09-24T12:00:05.12+00:00')).toBe('2026-09-24T12:00:00.120Z');
    expect(at('2026-09-24T12:00:05+00:00')).toBe('2026-09-24T12:00:00.000Z');
  });

  it('treats +00:00 and Z alike and honors other offsets', () => {
    const at = (ts: string) => overlapStart({ ts, id: 'last' }).ts;
    expect(at('2026-09-24T12:00:05.123456+00:00')).toBe(at('2026-09-24T12:00:05.123456Z'));
    expect(at('2026-09-24T14:00:05.123456+02:00')).toBe('2026-09-24T12:00:00.123Z');
  });
});
