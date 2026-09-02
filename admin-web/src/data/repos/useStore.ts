"use client";
import { useSyncExternalStore } from "react";
import type { Store } from "./store";

/** Wires any mock domain store into React with correct tearing semantics. */
export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
