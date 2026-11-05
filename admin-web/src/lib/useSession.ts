"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/data/repos/useStore";
import { authRepo, authStore } from "@/data/repos/auth";
import type { AuthUser } from "@/data/contracts/auth";

export function useRestoredSession(): {
  user: AuthUser | null;
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
