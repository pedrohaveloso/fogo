import { useEffect, useState } from "react";
import { retryConnection } from "../live.ts";

export const SLOW_LOADING_MS = 12_000;

export function LoadingNotice({ label }: { label: string }) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (slow) {
      return;
    }
    const timer = setTimeout(() => setSlow(true), SLOW_LOADING_MS);
    return () => clearTimeout(timer);
  }, [slow]);

  return (
    <main className="page">
      <div className="loading-notice" role="status">
        <p className="hint">{label}</p>
        {slow && (
          <>
            <p>
              A conexão com o servidor está demorando. Se houver muitas abas do F.O.G.O. abertas,
              feche algumas e tente de novo.
            </p>
            <button
              type="button"
              className="button button-small"
              onClick={() => {
                setSlow(false);
                retryConnection();
              }}
            >
              Tentar de novo
            </button>
          </>
        )}
      </div>
    </main>
  );
}
