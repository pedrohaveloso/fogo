import { useState, type FormEvent } from "react";
import type { Agency } from "../../shared/types.ts";
import { api, errorMessage } from "../api.ts";
import { cityPath } from "../cityScope.ts";
import { ConfirmDialog } from "../components/form.tsx";
import { LoadingNotice } from "../components/LoadingNotice.tsx";
import { reloadMeta, useMeta } from "../live.ts";
import { showToast } from "../toast.tsx";

function AgencyRow({ agency, onDelete }: { agency: Agency; onDelete: (agency: Agency) => void }) {
  const [name, setName] = useState(agency.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.put(cityPath(`/agencies/${agency.id}`), { name });
      reloadMeta();
      showToast(`Órgão renomeado para ${name.trim()}.`);
    } catch (reason) {
      setError(errorMessage(reason, "Não foi possível renomear."));
    } finally {
      setBusy(false);
    }
  };

  const fieldId = `agency-${agency.id}`;
  return (
    <li>
      <form className="inline-form" onSubmit={(event) => void save(event)} noValidate>
        <div className="field" data-invalid={Boolean(error)}>
          <label htmlFor={fieldId} className="visually-hidden">
            Nome do órgão
          </label>
          <input
            id={fieldId}
            value={name}
            maxLength={80}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${fieldId}-error` : undefined}
            onChange={(event) => setName(event.target.value)}
          />
          {error && (
            <span id={`${fieldId}-error`} className="field-error">
              {error}
            </span>
          )}
        </div>
        <button type="submit" className="button" disabled={busy || name.trim() === agency.name}>
          Salvar
        </button>
        <button type="button" className="button button-danger" onClick={() => onDelete(agency)}>
          Excluir
        </button>
      </form>
    </li>
  );
}

export function AgenciesPage() {
  const meta = useMeta();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Agency | null>(null);

  if (!meta) {
    return <LoadingNotice label="Carregando órgãos..." />;
  }

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const agency = await api.post<Agency>(cityPath("/agencies"), { name });
      setName("");
      reloadMeta();
      showToast(`${agency.name} cadastrado.`);
    } catch (reason) {
      setError(errorMessage(reason, "Não foi possível cadastrar."));
    } finally {
      setBusy(false);
    }
  };

  const destroy = async () => {
    const target = removing;
    setRemoving(null);
    if (!target) {
      return;
    }
    try {
      await api.delete(cityPath(`/agencies/${target.id}`));
      reloadMeta();
      showToast(`${target.name} excluído.`);
    } catch (reason) {
      showToast(errorMessage(reason, "Não foi possível excluir."));
    }
  };

  return (
    <main className="page">
      <div className="page-head">
        <h1>Órgãos de {meta.city.name}</h1>
      </div>
      <section className="panel stack" aria-labelledby="new-agency-title">
        <h2 id="new-agency-title" className="section-title">
          Novo órgão
        </h2>
        <form className="inline-form" onSubmit={(event) => void create(event)} noValidate>
          <div className="field" data-invalid={Boolean(error)}>
            <label htmlFor="new-agency" className="visually-hidden">
              Nome do órgão
            </label>
            <input
              id="new-agency"
              value={name}
              maxLength={80}
              placeholder="Ex.: Secretaria de Trânsito"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "new-agency-error" : undefined}
              onChange={(event) => setName(event.target.value)}
            />
            {error && (
              <span id="new-agency-error" className="field-error">
                {error}
              </span>
            )}
          </div>
          <button type="submit" className="button button-primary" disabled={busy}>
            Cadastrar órgão
          </button>
        </form>
      </section>
      <section className="panel stack" aria-labelledby="agency-list-title">
        <h2 id="agency-list-title" className="section-title">
          Cadastrados
        </h2>
        {meta.agencies.length === 0 ? (
          <p className="empty">
            Nenhum órgão ainda. Equipamentos e agentes precisam de um órgão responsável.
          </p>
        ) : (
          <ul className="edit-list">
            {meta.agencies.map((agency) => (
              <AgencyRow
                key={`${agency.id}-${agency.name}`}
                agency={agency}
                onDelete={setRemoving}
              />
            ))}
          </ul>
        )}
      </section>
      <ConfirmDialog
        open={removing !== null}
        title="Excluir este órgão?"
        message={`${removing?.name ?? "O órgão"} sai da lista. Só dá para excluir um órgão sem equipamentos nem agentes.`}
        confirmLabel="Excluir órgão"
        onConfirm={() => void destroy()}
        onCancel={() => setRemoving(null)}
      />
    </main>
  );
}
