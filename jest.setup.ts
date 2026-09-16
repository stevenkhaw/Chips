jest.mock('expo-crypto', () => ({
  randomUUID: () => require('crypto').randomUUID(),
}));
