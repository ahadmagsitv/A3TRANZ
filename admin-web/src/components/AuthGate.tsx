"use client";
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
