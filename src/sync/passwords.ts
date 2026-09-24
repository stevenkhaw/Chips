import * as SecureStore from 'expo-secure-store';

/** The owner's house password, kept on this phone only so it can be shown and shared (spec §2.2). */
const key = (houseId: string) => `house-password-${houseId}`;

export const savePassword = (houseId: string, password: string) => SecureStore.setItemAsync(key(houseId), password);
export const loadPassword = (houseId: string) => SecureStore.getItemAsync(key(houseId));
