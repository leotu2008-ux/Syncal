import { allowedEmails } from "./config";
import { getUser } from "./store";
import type { StoredUser } from "./types";

/** Google accounts per person, counting the one they sign in with. */
export const MAX_GOOGLE_ACCOUNTS = 5;
export const MAX_ICLOUD_ACCOUNTS = 3;

/** The person (by sign-in email) who has this Google account linked as an extra, if anyone. */
export async function ownerOfExtraGoogle(email: string): Promise<StoredUser | null> {
  for (const owner of allowedEmails()) {
    const user = await getUser(owner);
    if (user?.extraGoogle?.some((a) => a.email === email)) return user;
  }
  return null;
}
