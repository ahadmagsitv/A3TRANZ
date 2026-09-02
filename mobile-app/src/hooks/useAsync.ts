import { useCallback, useState, type DependencyList } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * The whole data-fetching layer.
 *
 * There is no API and no react-query (§2.1 — both explicitly rejected). Every
 * repo call is a promise against the in-memory mock, so a screen needs exactly
 * three things: the value, whether it is still loading, and a human message if
 * it threw. That is this hook.
 *
 * It re-runs on FOCUS, not on mount: a driver who deletes a photo on M8 and
 * goes back must not see M7's stale attachment count.
 */
export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Repo errors (`MockError`, `JobStateError`, `AuthError`) already carry copy
 * written for a driver. Anything else is a bug and gets the generic line —
 * never a raw stack, never "undefined is not an object" (§ non-negotiables).
 */
export const errorMessage = (e: unknown): string =>
  e instanceof Error && e.message.length > 0
    ? e.message
    : 'Something went wrong. Pull down or tap retry.';

export function useAsync<T>(
  run: () => Promise<T>,
  deps: DependencyList,
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The caller owns the dependency list, exactly as `useCallback` does.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const task = useCallback(run, deps);

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    task()
      .then(value => {
        if (alive) {
          setData(value);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (alive) {
          setError(errorMessage(e));
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [task]);

  useFocusEffect(load);

  return { data, loading, error, reload: load };
}
