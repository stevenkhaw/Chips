import { inviteRoute } from '@/domain/invite';

/**
 * Every invite URL (https, chips://, Expo Go's exp://…/--/join) lands on the join screen, prefilled.
 * It never joins by itself: the screen asks for one tap (spec §2.4). Other URLs pass through.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return inviteRoute(path);
  } catch {
    return '/';
  }
}
