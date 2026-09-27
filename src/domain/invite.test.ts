import { APP_SCHEME, INVITE_WEB_BASE, buildAppLink, buildInviteText, buildWebLink, inviteRoute, parseInviteUrl } from './invite';

const houseId = '0b7a6c7e-3f7e-4f6e-9a55-1c2d3e4f5a6b';
const secret = 'Ab_-0123456789abcdefghijklmnopqrstuvwxyzABC'; // 43 chars
const inv = { houseId, secret };

describe('invite links', () => {
  it('uses a 43-character fixture secret', () => {
    expect(secret).toHaveLength(43);
  });

  it('builds both forms', () => {
    expect(buildWebLink(inv)).toBe(`${INVITE_WEB_BASE}#h=${houseId}&s=${secret}`);
    expect(buildAppLink(inv)).toBe(`${APP_SCHEME}://join?h=${houseId}&s=${secret}`);
  });

  it.each([
    ['web', buildWebLink(inv)],
    ['web without trailing slash', `https://stevenkhaw.github.io/Chips/join#h=${houseId}&s=${secret}`],
    ['app', buildAppLink(inv)],
    ['app, params reversed', `chips://join?s=${secret}&h=${houseId}`],
    ['app, triple slash', `chips:///join?h=${houseId}&s=${secret}`],
    ['expo go', `exp://192.168.1.5:8081/--/join?h=${houseId}&s=${secret}`],
    ['uppercase uuid', buildAppLink({ houseId: houseId.toUpperCase(), secret })],
    ['unknown extra key', `chips://join?h=${houseId}&s=${secret}&utm=x`],
  ])('parses %s', (_, url) => {
    expect(parseInviteUrl(url)).toEqual({ kind: 'invite', invite: { houseId, secret } });
  });

  it.each([
    ['missing secret', `chips://join?h=${houseId}`],
    ['no params', 'chips://join'],
    ['short secret', `chips://join?h=${houseId}&s=abc`],
    ['secret with bad chars', `chips://join?h=${houseId}&s=${secret.slice(0, 42)}+`],
    ['bad uuid', `chips://join?h=not-a-uuid&s=${secret}`],
    ['web, secret in query not fragment', `${INVITE_WEB_BASE}?h=${houseId}&s=${secret}`],
    ['duplicate h', `chips://join?h=${houseId}&h=${houseId}&s=${secret}`],
  ])('rejects %s as bad', (_, url) => {
    expect(parseInviteUrl(url)).toEqual({ kind: 'bad' });
  });

  it.each([
    'chips://',
    'chips://houses/new',
    '/session/abc',
    '/houses/join',
    'https://stevenkhaw.github.io/Chips/privacy-policy.html',
    `https://evil.example/Chips/join/#h=${houseId}&s=${secret}`,
    'https://stevenkhaw.github.io/Chips/joinery',
    `http://stevenkhaw.github.io/Chips/join/#h=${houseId}&s=${secret}`,
  ])('ignores non-invite url %s', (url) => {
    expect(parseInviteUrl(url)).toBeNull();
  });
});

describe('inviteRoute', () => {
  it('sends invites to the prefilled join screen', () => {
    expect(inviteRoute(buildWebLink(inv))).toBe(`/houses/join?h=${houseId}&s=${secret}`);
    expect(inviteRoute(buildAppLink(inv))).toBe(`/houses/join?h=${houseId}&s=${secret}`);
  });
  it('flags a broken invite', () => {
    expect(inviteRoute('chips://join?h=nope')).toBe('/houses/join?bad=1');
  });
  it('passes everything else through', () => {
    expect(inviteRoute('chips://session/abc')).toBe('chips://session/abc');
    expect(inviteRoute('/houses/new')).toBe('/houses/new');
  });
});

describe('buildInviteText', () => {
  it('has every line when everything is known', () => {
    expect(buildInviteText({ houseName: 'Tuesday Crew', joinCode: 'K7QXM2PA', password: 'hunter22', invite: inv })).toBe(
      [
        'Join my Chips house "Tuesday Crew"',
        `Tap: ${buildWebLink(inv)}`,
        `Or: ${buildAppLink(inv)}`,
        'Or in the app → Join house:',
        '  Code: K7QX-M2PA',
        '  Password: hunter22',
      ].join('\n'),
    );
  });

  it('omits the password when this phone does not know it', () => {
    const t = buildInviteText({ houseName: 'H', joinCode: 'K7QXM2PA', password: null, invite: inv });
    expect(t).not.toMatch(/Password/);
    expect(t).toMatch(/Code: K7QX-M2PA$/);
  });

  it('falls back to code only without a secret', () => {
    const t = buildInviteText({ houseName: 'H', joinCode: 'K7QXM2PA', password: 'pw12', invite: null });
    expect(t).not.toMatch(/Tap:|Or:/);
    expect(t).toMatch(/Join house:\n {2}Code: K7QX-M2PA\n {2}Password: pw12$/);
  });

  it('has only links without a join code', () => {
    const t = buildInviteText({ houseName: 'H', joinCode: null, password: 'pw12', invite: inv });
    expect(t).not.toMatch(/Join house:|Password/);
    expect(t.split('\n')).toHaveLength(3);
  });
});
