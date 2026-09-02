"use client";
// Route guard for the (app) shell (plan §6.6 / W-02): the role chosen at W1
// is what everything downstream reads, so nothing downstream should be
// reachable without it.
//
// The store starts empty on every page load even when the session is live, so
// the token has to be redeemed before deciding. Bouncing first would sign the
// user out on every refresh.
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRestoredSession } from "@/lib/useSession";

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, checked } = useRestoredSession();

  useEffect(() => {
    if (checked && !user) router.replace("/login");
  }, [checked, user, router]);

  if (!user) return null;
  return <>{children}</>;
}
