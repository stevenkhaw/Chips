import * as SecureStore from 'expo-secure-store';

/**
 * The owner's house password and invite link secret, kept on this phone only so they can be shown
 * and shared (spec §2.2, §2.5). The server stays the source of truth for the secret.
 */
const key = (houseId: string) => `house-password-${houseId}`;
const inviteKey = (houseId: string) => `house-invite-${houseId}`;

export const savePassword = (houseId: string, password: string) => SecureStore.setItemAsync(key(houseId), password);
export const loadPassword = (houseId: string) => SecureStore.getItemAsync(key(houseId));

export const saveInviteSecret = (houseId: string, secret: string) => SecureStore.setItemAsync(inviteKey(houseId), secret);
export const loadInviteSecret = (houseId: string) => SecureStore.getItemAsync(inviteKey(houseId));

/** After a house leaves this phone. Never throws: a stale secret left behind is harmless. */
export async function forgetHouseSecrets(houseId: string): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(key(houseId)).catch(() => {}),
    SecureStore.deleteItemAsync(inviteKey(houseId)).catch(() => {}),
  ]);
}
