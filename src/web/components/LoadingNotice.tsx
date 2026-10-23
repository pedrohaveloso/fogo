import { useEffect, useState } from "react";
import { retryConnection } from "../live.ts";

export const SLOW_LOADING_MS = 12_000;

function useSlow(): [boolean, () => void] {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (slow) {
      return;
    }
    const timer = setTimeout(() => setSlow(true), SLOW_LOADING_MS);
    return () => clearTimeout(timer);
  }, [slow]);
  return [slow, () => setSlow(false)];
}

type Props = { label: string; onRetry?: () => void };

function SlowMessage({ onRetry }: { onRetry: () => void }) {
  return (
    <>
      <p>
        A conexão com o servidor está demorando. Se houver muitas abas do F.O.G.O. abertas, feche
        algumas e tente de novo.
      </p>
      <button type="button" className="button button-small" onClick={onRetry}>
        Tentar de novo
      </button>
    </>
  );
}

export function InlineLoading({ label, onRetry = retryConnection }: Props) {
  const [slow, reset] = useSlow();
  return (
    <div className="loading-notice" role="status">
      <p className="hint">{label}</p>
      {slow && (
        <SlowMessage
          onRetry={() => {
            reset();
            onRetry();
          }}
        />
      )}
    </div>
  );
}

export function LoadingNotice(props: Props) {
  return (
    <main className="page">
      <InlineLoading {...props} />
    </main>
  );
}
