import { useState } from "react";
import type { CreatedTag, Tag } from "../../shared/types.ts";
import { api, ApiError } from "../api.ts";
import { formatRelative } from "../format.ts";
import { showToast } from "../toast.tsx";
import { useNow } from "../useNow.ts";
import { ConfirmDialog } from "./form.tsx";
import { cityPath } from "../cityScope.ts";
import { Link } from "../router.tsx";

type Props = {
  target: { equipmentId: number } | { agentId: number };
  initial: Tag | null;
};

export function locationUrl(origin: string, tagId: string): string {
  return `${origin}/api/tags/${tagId}/location`;
}

function copy(text: string): void {
  void navigator.clipboard
    ?.writeText(text)
    .then(() => showToast("Copiado."))
    .catch(() => showToast("Não deu para copiar. Selecione o texto e copie à mão."));
}

export function TagPanel({ target, initial }: Props) {
  const now = useNow(30_000);
  const [tag, setTag] = useState(initial);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<CreatedTag>(cityPath("/tags"), target);
      setTag(created.tag);
      setToken(created.token);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Não foi possível criar a tag.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setConfirmRemove(false);
    if (!tag) {
      return;
    }
    setBusy(true);
    try {
      await api.delete(cityPath(`/tags/${tag.id}`));
      setTag(null);
      setToken(null);
      showToast(`Tag ${tag.id} removida.`);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Não foi possível remover a tag.");
    } finally {
      setBusy(false);
    }
  };

  const url = tag ? locationUrl(window.location.origin, tag.id) : "";

  return (
    <section className="form-section tag-panel" aria-labelledby="tag-title">
      <h2 id="tag-title" className="tag-panel-title">
        Rastreador
      </h2>
      {tag ? (
        <>
          <dl className="tag-facts">
            <div>
              <dt>Tag</dt>
              <dd>
                <code>{tag.id}</code>
              </dd>
            </div>
            <div>
              <dt>Última leitura</dt>
              <dd>
                {tag.lastReportAt ? formatRelative(tag.lastReportAt, now) : "nenhuma até agora"}
              </dd>
            </div>
          </dl>
          {token ? (
            <div className="tag-secret">
              <p>
                <strong>Grave o token no aparelho agora.</strong> Ele não aparece de novo. Se
                perder, remova a tag e crie outra.
              </p>
              <div className="tag-copy">
                <code>{token}</code>
                <button type="button" className="button button-small" onClick={() => copy(token)}>
                  Copiar token
                </button>
              </div>
              <div className="tag-copy">
                <code>{url}</code>
                <button type="button" className="button button-small" onClick={() => copy(url)}>
                  Copiar endereço
                </button>
              </div>
            </div>
          ) : (
            <div className="tag-copy">
              <code>{url}</code>
              <button type="button" className="button button-small" onClick={() => copy(url)}>
                Copiar endereço
              </button>
            </div>
          )}
          {!token && (
            <p className="hint">
              O token não aparece de novo. Para trocar o aparelho ou o token, remova a tag e crie
              outra. O passo a passo está em <Link href="/docs">Documentações</Link>.
            </p>
          )}
          <div>
            <button
              type="button"
              className="button button-small button-danger"
              disabled={busy}
              onClick={() => setConfirmRemove(true)}
            >
              Remover tag
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="hint">
            Sem rastreador. Crie uma tag para que um aparelho com GPS informe a posição real. O
            passo a passo está em <Link href="/docs">Documentações</Link>.
          </p>
          <div>
            <button
              type="button"
              className="button button-small"
              disabled={busy}
              onClick={() => void create()}
            >
              Criar tag
            </button>
          </div>
        </>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={confirmRemove}
        title="Remover esta tag?"
        message="O aparelho deixa de ser aceito na hora. Para voltar a usar, crie uma tag nova e grave o novo token nele."
        confirmLabel="Remover tag"
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
      />
    </section>
  );
}
