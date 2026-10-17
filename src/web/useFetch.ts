import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api.ts";

export type FetchState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
};

type Result<T> = { key: string | null; data: T | null; error: string | null };

export function useFetch<T>(path: string | null, refreshMs?: number): FetchState<T> {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<Result<T>>({ key: null, data: null, error: null });
  const key = path === null ? null : `${path}#${version}`;
  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    if (path === null || key === null) {
      return;
    }
    let cancelled = false;
    api
      .get<T>(path)
      .then((data) => {
        if (!cancelled) {
          setResult({ key, data, error: null });
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setResult((previous) => ({
            key,
            data: previous.data,
            error:
              reason instanceof ApiError ? reason.message : "Não foi possível carregar os dados.",
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, key]);

  useEffect(() => {
    if (!refreshMs || path === null) {
      return;
    }
    const timer = setInterval(reload, refreshMs);
    return () => clearInterval(timer);
  }, [refreshMs, path, reload]);

  return {
    data: path === null ? null : result.data,
    error: path === null ? null : result.error,
    loading: key !== null && result.key !== key,
    reload,
  };
}
