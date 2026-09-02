"use client";
// Redeeming the persisted token, once, wherever the app is entered.
//
// Two entry points need this and they must not drift: the app shell (or a
// signed-in user gets bounced to /login on every reload) and /login itself (or
// someone with a live session is shown a sign-in form). The token lives in
// localStorage; this is what turns it back into a user.
import { useEffect, useState } from "react";
import { useStore } from "@/data/repos/useStore";
import { authRepo, authStore } from "@/data/repos/auth";
import type { AuthUser } from "@/data/contracts/auth";

export function useRestoredSession(): {
  user: AuthUser | null;
  /** False until the token has been redeemed (or found absent). */
  checked: boolean;
} {
  const user = useStore(authStore);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (user) {
      setChecked(true);
      return;
    }
    let live = true;
    authRepo.currentUser().finally(() => {
      if (live) setChecked(true);
    });
    return () => {
      live = false;
    };
  }, [user]);

  return { user, checked };
}
