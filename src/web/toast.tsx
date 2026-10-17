import { useEffect, useSyncExternalStore } from "react";

let message: string | null = null;
const listeners = new Set<() => void>();

export function showToast(text: string): void {
  message = text;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function Toast() {
  const current = useSyncExternalStore(subscribe, () => message);
  useEffect(() => {
    if (!current) {
      return;
    }
    const timer = setTimeout(() => showToast(""), 4000);
    return () => clearTimeout(timer);
  }, [current]);
  return (
    <div role="status" aria-live="polite">
      {current ? <div className="toast">{current}</div> : null}
    </div>
  );
}
