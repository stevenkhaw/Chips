import { createTestDb } from '../../test/nodeDb';
import { setDb } from '@/db/connection';
import { usePlayersStore } from './usePlayersStore';
import { useSettingsStore } from './useSettingsStore';
import { useSessionsStore } from './useSessionsStore';
import { useHousesStore, selectCanEdit } from './useHousesStore';
import { createHouse, deleteHouse, reloadAll, switchHouse } from './houseActions';

beforeEach(() => {
  setDb(createTestDb());
  usePlayersStore.setState({ players: [] });
  useSettingsStore.setState({ settings: { defaultBuyinCents: 2000, currencySymbol: '$' }, denoms: [] });
  useSessionsStore.setState({ summaries: [], detail: null });
  useHousesStore.setState({ houses: [], currentHouseId: null, previewAsReader: false });
  reloadAll();
});

describe('usePlayersStore', () => {
  it('add persists and updates state', () => {
    const p = usePlayersStore.getState().add('Ann');
    expect(usePlayersStore.getState().players.map((x) => x.id)).toEqual([p.id]);
    usePlayersStore.setState({ players: [] });
    usePlayersStore.getState().load();
    expect(usePlayersStore.getState().players).toHaveLength(1);
  });

  it('propagates repo errors without changing state', () => {
    usePlayersStore.getState().add('Ann');
    expect(() => usePlayersStore.getState().add('ann')).toThrow('Name already exists');
    expect(usePlayersStore.getState().players).toHaveLength(1);
  });
});

describe('useSettingsStore', () => {
  it('loads defaults and updates buy-in', () => {
    useSettingsStore.getState().load();
    expect(useSettingsStore.getState().settings.defaultBuyinCents).toBe(2000);
    useSettingsStore.getState().setDefaultBuyin(2500);
    expect(useSettingsStore.getState().settings.defaultBuyinCents).toBe(2500);
  });

  it('manages denoms', () => {
    const s = useSettingsStore.getState();
    s.addDenom({ label: 'Red', colorHex: '#f00', valueCents: 100 });
    expect(useSettingsStore.getState().denoms).toHaveLength(1);
    const id = useSettingsStore.getState().denoms[0].id;
    useSettingsStore.getState().updateDenom(id, { valueCents: 200 });
    expect(useSettingsStore.getState().denoms[0].valueCents).toBe(200);
    useSettingsStore.getState().removeDenom(id);
    expect(useSettingsStore.getState().denoms).toHaveLength(0);
  });
});

describe('useSessionsStore', () => {
  it('create → open → edit → summaries reflect changes', () => {
    const ann = usePlayersStore.getState().add('Ann');
    const bob = usePlayersStore.getState().add('Bob');
    const s = useSessionsStore.getState().create({ date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [ann.id, bob.id] });
    expect(useSessionsStore.getState().summaries).toHaveLength(1);

    useSessionsStore.getState().open(s.id);
    const d = useSessionsStore.getState().detail!;
    expect(d.players).toHaveLength(2);

    useSessionsStore.getState().addBuyin(d.players[0].sp.id, 2000);
    useSessionsStore.getState().addBuyin(d.players[1].sp.id, 2000);
    useSessionsStore.getState().setCashout(d.players[0].sp.id, 0);
    useSessionsStore.getState().setCashout(d.players[1].sp.id, 4000);

    const d2 = useSessionsStore.getState().detail!;
    expect(d2.players[0].buyins).toHaveLength(1);
    expect(d2.players[1].sp.cashoutCents).toBe(4000);
    expect(useSessionsStore.getState().summaries[0].topWinner).toEqual({ name: 'Bob', netCents: 2000 });

    useSessionsStore.getState().deleteSession(s.id);
    expect(useSessionsStore.getState().summaries).toEqual([]);
    expect(useSessionsStore.getState().detail).toBeNull();
  });

  it('lastPlayerIds', () => {
    const ann = usePlayersStore.getState().add('Ann');
    expect(useSessionsStore.getState().lastPlayerIds()).toEqual([]);
    useSessionsStore.getState().create({ date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    expect(useSessionsStore.getState().lastPlayerIds()).toEqual([ann.id]);
  });

  it('addPayment → detail.payments length 1 → removePayment → 0', () => {
    const ann = usePlayersStore.getState().add('Ann');
    const bob = usePlayersStore.getState().add('Bob');
    const s = useSessionsStore.getState().create({ date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [ann.id, bob.id] });
    useSessionsStore.getState().open(s.id);

    useSessionsStore.getState().addPayment({ fromPlayerId: bob.id, toPlayerId: ann.id, amountCents: 500 });
    expect(useSessionsStore.getState().detail!.payments).toHaveLength(1);

    const paymentId = useSessionsStore.getState().detail!.payments[0].id;
    useSessionsStore.getState().removePayment(paymentId);
    expect(useSessionsStore.getState().detail!.payments).toHaveLength(0);
  });
});

describe('houses', () => {
  it('reloadAll loads My House as current', () => {
    const s = useHousesStore.getState();
    expect(s.houses.map((h) => h.name)).toEqual(['My House']);
    expect(s.currentHouseId).toBe(s.houses[0].id);
  });

  it('createHouse makes the new house current and scopes players, nights and currency', () => {
    usePlayersStore.getState().add('Ann');
    const ann = usePlayersStore.getState().players[0];
    useSessionsStore.getState().create({ date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    const home = useHousesStore.getState().currentHouseId!;

    const work = createHouse({ name: 'Work', currencySymbol: '€' });
    expect(useHousesStore.getState().currentHouseId).toBe(work.id);
    expect(usePlayersStore.getState().players).toEqual([]);
    expect(useSessionsStore.getState().summaries).toEqual([]);
    expect(useSettingsStore.getState().settings.currencySymbol).toBe('€');

    switchHouse(home);
    expect(usePlayersStore.getState().players.map((p) => p.name)).toEqual(['Ann']);
    expect(useSessionsStore.getState().summaries).toHaveLength(1);
    expect(useSettingsStore.getState().settings.currencySymbol).toBe('$');
  });

  it('switching closes any open night', () => {
    const ann = usePlayersStore.getState().add('Ann');
    const s = useSessionsStore.getState().create({ date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    useSessionsStore.getState().open(s.id);
    createHouse({ name: 'Work', currencySymbol: '$' });
    expect(useSessionsStore.getState().detail).toBeNull();
  });

  it('deleteHouse falls back to another house', () => {
    const home = useHousesStore.getState().currentHouseId!;
    const work = createHouse({ name: 'Work', currencySymbol: '$' });
    deleteHouse(work.id);
    expect(useHousesStore.getState().currentHouseId).toBe(home);
    expect(useHousesStore.getState().houses).toHaveLength(1);
  });

  it('selectCanEdit: owners edit, readers and reader-preview do not', () => {
    const owner = useHousesStore.getState();
    expect(selectCanEdit(owner)).toBe(true);
    expect(selectCanEdit({ ...owner, previewAsReader: true })).toBe(false);
    const readerHouses = owner.houses.map((h) => ({ ...h, role: 'reader' as const }));
    expect(selectCanEdit({ ...owner, houses: readerHouses })).toBe(false);
    expect(selectCanEdit({ ...owner, currentHouseId: null })).toBe(false);
  });
});
