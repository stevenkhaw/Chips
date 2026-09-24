import { formatJoinCode } from './joinCode';

describe('formatJoinCode', () => {
  it('splits 8 characters with a hyphen and leaves anything else alone', () => {
    expect(formatJoinCode('K7QXM2PA')).toBe('K7QX-M2PA');
    expect(formatJoinCode('ABC')).toBe('ABC');
  });
});
