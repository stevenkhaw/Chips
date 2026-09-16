import { formatCents, formatSigned, parseMoneyInput } from './money';

describe('formatCents', () => {
  it('drops .00', () => expect(formatCents(2000)).toBe('$20'));
  it('keeps cents', () => expect(formatCents(1250)).toBe('$12.50'));
  it('pads single cent digit', () => expect(formatCents(1205)).toBe('$12.05'));
  it('negative', () => expect(formatCents(-725)).toBe('-$7.25'));
  it('zero', () => expect(formatCents(0)).toBe('$0'));
  it('custom symbol', () => expect(formatCents(500, '€')).toBe('€5'));
});

describe('formatSigned', () => {
  it('positive gets plus', () => expect(formatSigned(2000)).toBe('+$20'));
  it('negative', () => expect(formatSigned(-725)).toBe('-$7.25'));
  it('zero has no sign', () => expect(formatSigned(0)).toBe('$0'));
});

describe('parseMoneyInput', () => {
  it('whole dollars', () => expect(parseMoneyInput('20')).toBe(2000));
  it('decimals', () => expect(parseMoneyInput('12.5')).toBe(1250));
  it('two decimals', () => expect(parseMoneyInput('12.05')).toBe(1205));
  it('strips symbol and spaces', () => expect(parseMoneyInput(' $20 ')).toBe(2000));
  it('rejects three decimals', () => expect(parseMoneyInput('1.234')).toBeNull());
  it('rejects letters', () => expect(parseMoneyInput('abc')).toBeNull());
  it('rejects empty', () => expect(parseMoneyInput('')).toBeNull());
  it('rejects negative', () => expect(parseMoneyInput('-5')).toBeNull());
  it('accepts leading dot', () => expect(parseMoneyInput('.5')).toBe(50));
});
