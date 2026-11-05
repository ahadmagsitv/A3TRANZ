import { useCallback, useState, type DependencyList } from 'react';
import { useFocusEffect } from '@react-navigation/native';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

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
