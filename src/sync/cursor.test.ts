import { OVERLAP_MS, ZERO_UUID, overlapStart, parseCursors, serializeCursors } from './cursor';

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
});
