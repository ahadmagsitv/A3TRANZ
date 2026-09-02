// A subscribable store for React's useSyncExternalStore (plan §2.2, no state
// library). The artificial network delay that used to live here went with the
// mocks — the API supplies the real latency that keeps W3-loading reachable.

export type Listener = () => void;

export interface Store<T> {
  get(): T;
  set(next: T): void;
  subscribe(listener: Listener): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set: (next: T) => {
      state = next;
      listeners.forEach((l) => l());
    },
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
