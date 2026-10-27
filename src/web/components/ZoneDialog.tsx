import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Neighborhood, Region } from "../../shared/types.ts";
import { plural } from "../../shared/text.ts";
import { api, errorMessage } from "../api.ts";
import { cityPath } from "../cityScope.ts";
import { reloadMeta } from "../live.ts";
import { showToast } from "../toast.tsx";

function ZoneRow({ region, count }: { region: Region; count: number }) {
  const [name, setName] = useState(region.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = `zone-${region.id}`;

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.put(cityPath(`/regions/${region.id}`), { name });
      reloadMeta();
      showToast(`Zona renomeada para ${name.trim()}.`);
    } catch (reason) {
      setError(errorMessage(reason, "Não foi possível renomear."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.delete(cityPath(`/regions/${region.id}`));
      reloadMeta();
      showToast(`${region.name} excluída.`);
    } catch (reason) {
      setError(errorMessage(reason, "Não foi possível excluir."));
      setBusy(false);
    }
  };

  return (
    <li>
      <form className="inline-form" onSubmit={(event) => void rename(event)} noValidate>
        <div className="field" data-invalid={Boolean(error)}>
          <label htmlFor={id} className="visually-hidden">
            Nome da zona
          </label>
          <input
            id={id}
            value={name}
            maxLength={80}
            placeholder="Nome da zona"
            aria-invalid={Boolean(error)}
            aria-describedby={`${id}-count${error ? ` ${id}-error` : ""}`}
            onChange={(event) => setName(event.target.value)}
          />
          {error && (
            <span id={`${id}-error`} className="field-error">
              {error}
            </span>
          )}
        </div>
        <span id={`${id}-count`} className="zone-count">
          {count} {plural(count, "bairro", "bairros")}
        </span>
        <button type="submit" className="button" disabled={busy || name.trim() === region.name}>
          Salvar
        </button>
        <button
          type="button"
          className="button button-danger"
          disabled={busy || count > 0}
          title={count > 0 ? "Mude os bairros desta zona antes de excluir" : undefined}
          onClick={() => void remove()}
        >
          Excluir
        </button>
      </form>
    </li>
  );
}

export function ZoneDialog({
  open,
  regions,
  neighborhoods,
  onClose,
}: {
  open: boolean;
  regions: readonly Region[];
  neighborhoods: readonly Neighborhood[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog?.open) {
      dialog.close();
    }
  }, [open]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const region = await api.post<Region>(cityPath("/regions"), { name });
      setName("");
      reloadMeta();
      showToast(`${region.name} cadastrada.`);
    } catch (reason) {
      setError(errorMessage(reason, "Não foi possível cadastrar."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} className="zone-dialog" onClose={onClose} aria-labelledby="zones-title">
      <h2 id="zones-title" className="dialog-title">
        Zonas
      </h2>
      <form className="inline-form zone-create" onSubmit={(event) => void create(event)} noValidate>
        <div className="field" data-invalid={Boolean(error)}>
          <label htmlFor="new-zone" className="visually-hidden">
            Nome da nova zona
          </label>
          <input
            id="new-zone"
            value={name}
            maxLength={80}
            placeholder="Nova zona, como Zona Norte"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "new-zone-error" : undefined}
            onChange={(event) => setName(event.target.value)}
          />
          {error && (
            <span id="new-zone-error" className="field-error">
              {error}
            </span>
          )}
        </div>
        <button type="submit" className="button button-primary" disabled={busy}>
          Cadastrar zona
        </button>
      </form>
      {regions.length === 0 ? (
        <p className="empty">Nenhuma zona ainda. Todo bairro pertence a uma zona.</p>
      ) : (
        <ul className="edit-list">
          {regions.map((region) => (
            <ZoneRow
              key={`${region.id}-${region.name}`}
              region={region}
              count={neighborhoods.filter((item) => item.regionId === region.id).length}
            />
          ))}
        </ul>
      )}
      <div className="dialog-actions">
        <button type="button" className="button" onClick={onClose}>
          Fechar
        </button>
      </div>
    </dialog>
  );
}
