import { useMemo, useState } from "react";
import { ZoneDialog } from "../components/ZoneDialog.tsx";
import type { LngLat } from "../../shared/geo.ts";
import { fold } from "../../shared/text.ts";
import type { NeighborhoodShape } from "../../shared/types.ts";
import { api, errorMessage } from "../api.ts";
import { ConfirmDialog } from "../components/form.tsx";
import { LoadingNotice } from "../components/LoadingNotice.tsx";
import { formatInteger } from "../format.ts";
import { reloadMeta, useMeta } from "../live.ts";
import { ShapeEditor } from "../map/ShapeEditor.tsx";
import {
  mergeShapes,
  removeVertex,
  sameShape,
  shapeProblem,
  MIN_SHAPE_POINTS,
} from "../shapeEditing.ts";
import { showToast } from "../toast.tsx";
import { useFetch } from "../useFetch.ts";
import { cityPath } from "../cityScope.ts";

type Details = { name: string; regionId: string };

function revealSelected(node: HTMLButtonElement | null): void {
  node?.scrollIntoView({ block: "nearest" });
}

export function NeighborhoodsPage() {
  const meta = useMeta();
  const shapes = useFetch<NeighborhoodShape[]>(cityPath("/neighborhoods"));
  const [saved, setSaved] = useState<Map<string, NeighborhoodShape | null>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState<Details | null>(null);
  const [details, setDetails] = useState<Details>({ name: "", regionId: "" });
  const [zonesOpen, setZonesOpen] = useState(false);
  const [draft, setDraft] = useState<LngLat[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [selectedVertex, setSelectedVertex] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const list = useMemo(
    () =>
      mergeShapes(shapes.data ?? [], saved).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [shapes.data, saved],
  );
  const selected = list.find((item) => item.id === selectedId) ?? null;
  const detailsChanged =
    selected !== null &&
    (details.name.trim() !== selected.name || details.regionId !== selected.regionId);
  const shapeChanged = selected !== null && (drawing || !sameShape(draft, selected.polygon));
  const dirty =
    creating !== null
      ? draft.length > 0 || creating.name.trim() !== ""
      : detailsChanged || shapeChanged;
  const problem = selected || creating ? shapeProblem(draft) : null;
  const query = fold(search);
  const visible = list.filter((item) => fold(item.name).includes(query));

  if (!meta || !shapes.data) {
    return <LoadingNotice label="Carregando bairros..." />;
  }

  const startEditing = (polygon: LngLat[]) => {
    setDraft([...polygon]);
    setDrawing(false);
    setSelectedVertex(null);
    setError(null);
  };

  const select = (id: string) => {
    if (id === selectedId) {
      return;
    }
    if (dirty) {
      showToast("Salve ou descarte as mudanças antes de trocar de bairro.");
      return;
    }
    const target = list.find((item) => item.id === id);
    setCreating(null);
    setSelectedId(id);
    setDetails({ name: target?.name ?? "", regionId: target?.regionId ?? "" });
    startEditing(target?.polygon ?? []);
  };

  const startCreating = () => {
    if (dirty) {
      showToast("Salve ou descarte as mudanças antes de criar um bairro.");
      return;
    }
    setSelectedId(null);
    setCreating({ name: "", regionId: "" });
    startEditing([]);
    setDrawing(true);
  };

  const store = (shape: NeighborhoodShape, message: string) => {
    setSaved((previous) => new Map(previous).set(shape.id, shape));
    setDetails({ name: shape.name, regionId: shape.regionId });
    startEditing(shape.polygon);
    reloadMeta();
    showToast(message);
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (reason) {
      setError(errorMessage(reason, "Não foi possível salvar o bairro."));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      let shape = selected!;
      if (detailsChanged) {
        shape = await api.put<NeighborhoodShape>(cityPath(`/neighborhoods/${selectedId}`), details);
      }
      if (shapeChanged) {
        shape = await api.put<NeighborhoodShape>(cityPath(`/neighborhoods/${selectedId}/shape`), {
          polygon: draft,
        });
      }
      store(shape, `${shape.name} salvo.`);
    });

  const create = () =>
    run(async () => {
      const shape = await api.post<NeighborhoodShape>(cityPath("/neighborhoods"), {
        ...creating,
        polygon: draft,
      });
      setCreating(null);
      setSelectedId(shape.id);
      store(shape, `${shape.name} cadastrado.`);
    });

  const restore = () =>
    run(async () => {
      const shape = await api.delete<NeighborhoodShape>(
        cityPath(`/neighborhoods/${selectedId}/shape`),
      );
      store(shape, `${shape.name} voltou ao limite gerado a partir do OpenStreetMap.`);
    });

  const destroy = () => {
    setConfirmDelete(false);
    const target = selected;
    if (!target) {
      return;
    }
    void run(async () => {
      await api.delete(cityPath(`/neighborhoods/${target.id}`));
      setSaved((previous) => new Map(previous).set(target.id, null));
      setSelectedId(null);
      startEditing([]);
      reloadMeta();
      showToast(`${target.name} excluído.`);
    });
  };

  const discard = () => {
    if (creating) {
      setCreating(null);
      startEditing([]);
    } else {
      setDetails({ name: selected?.name ?? "", regionId: selected?.regionId ?? "" });
      startEditing(selected?.polygon ?? []);
    }
  };

  const remove = (index: number) => {
    if (draft.length <= MIN_SHAPE_POINTS) {
      showToast(`O bairro precisa de ao menos ${MIN_SHAPE_POINTS} pontos.`);
      return;
    }
    setDraft(removeVertex(draft, index));
    setSelectedVertex(null);
  };

  const drawingTools = drawing ? (
    <>
      <button
        type="button"
        className="button"
        disabled={draft.length === 0}
        onClick={() => setDraft(draft.slice(0, -1))}
      >
        Desfazer ponto
      </button>
      <button
        type="button"
        className="button"
        disabled={draft.length < MIN_SHAPE_POINTS}
        onClick={() => setDrawing(false)}
      >
        Concluir desenho
      </button>
    </>
  ) : (
    <>
      <button
        type="button"
        className="button"
        onClick={() => {
          setDraft([]);
          setDrawing(true);
          setSelectedVertex(null);
        }}
      >
        Redesenhar
      </button>
      <button
        type="button"
        className="button"
        disabled={selectedVertex === null}
        onClick={() => selectedVertex !== null && remove(selectedVertex)}
      >
        Apagar ponto
      </button>
    </>
  );

  const status = (
    <p className="hint" role="status">
      {problem ?? `${formatInteger(draft.length)} pontos`}
      {dirty && !problem && !creating ? ", com mudanças não salvas" : ""}
    </p>
  );

  const fields = (value: Details, onChange: (next: Details) => void, prefix: string) => (
    <div className="shape-fields">
      <div className="field">
        <label htmlFor={`${prefix}-name`}>Nome</label>
        <input
          id={`${prefix}-name`}
          value={value.name}
          maxLength={80}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${prefix}-region`}>Zona</label>
        <select
          id={`${prefix}-region`}
          value={value.regionId}
          onChange={(event) => onChange({ ...value, regionId: event.target.value })}
        >
          <option value="">
            {meta.regions.length === 0 ? "Cadastre uma zona antes" : "Selecione"}
          </option>
          {meta.regions.map((region) => (
            <option key={region.id} value={region.id}>
              {region.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  return (
    <main className="page page-fill">
      <div className="page-head">
        <h1>Bairros</h1>
        <div className="page-actions">
          <button type="button" className="button" onClick={() => setZonesOpen(true)}>
            Zonas
          </button>
          <button type="button" className="button button-primary" onClick={startCreating}>
            Novo bairro
          </button>
        </div>
      </div>
      <div className="shape-layout">
        <section className="panel shape-list" aria-labelledby="shape-list-title">
          <h2 id="shape-list-title" className="visually-hidden">
            Lista de bairros
          </h2>
          <label htmlFor="shape-search" className="visually-hidden">
            Buscar bairro
          </label>
          <input
            id="shape-search"
            type="search"
            className="input"
            placeholder="Buscar bairro"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <ul>
            {visible.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  ref={item.id === selectedId ? revealSelected : undefined}
                  aria-pressed={item.id === selectedId}
                  onClick={() => select(item.id)}
                >
                  <span>{item.name}</span>
                  {item.edited && <span className="plate">Editado</span>}
                </button>
              </li>
            ))}
            {visible.length === 0 && (
              <li className="empty">
                {list.length === 0
                  ? "Nenhum bairro cadastrado ainda."
                  : "Nenhum bairro com esse nome."}
              </li>
            )}
          </ul>
        </section>
        <section className="shape-workspace" aria-label="Edição do limite">
          <div className="panel shape-toolbar" hidden={!selected && !creating && !error}>
            {creating ? (
              <>
                <div className="shape-title">
                  <h2>Novo bairro</h2>
                  {status}
                </div>
                {fields(creating, setCreating, "new-neighborhood")}
                <div className="shape-actions">
                  {drawingTools}
                  <button type="button" className="button button-ghost" onClick={discard}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={
                      drawing ||
                      problem !== null ||
                      draft.length < MIN_SHAPE_POINTS ||
                      creating.name.trim() === "" ||
                      creating.regionId === "" ||
                      busy
                    }
                    onClick={() => void create()}
                  >
                    Salvar bairro
                  </button>
                </div>
              </>
            ) : selected ? (
              <>
                <div className="shape-title">
                  <h2>{selected.name}</h2>
                  {status}
                </div>
                {fields(details, setDetails, "neighborhood")}
                <div className="shape-actions">
                  {drawingTools}
                  {dirty && (
                    <button type="button" className="button button-ghost" onClick={discard}>
                      Descartar
                    </button>
                  )}
                  {!dirty && selected.edited && (
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={() => void restore()}
                    >
                      Restaurar original
                    </button>
                  )}
                  {!dirty && (
                    <button
                      type="button"
                      className="button button-danger"
                      disabled={busy}
                      onClick={() => setConfirmDelete(true)}
                    >
                      Excluir bairro
                    </button>
                  )}
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={
                      !dirty ||
                      drawing ||
                      problem !== null ||
                      draft.length < MIN_SHAPE_POINTS ||
                      details.name.trim() === "" ||
                      busy
                    }
                    onClick={() => void save()}
                  >
                    Salvar bairro
                  </button>
                </div>
              </>
            ) : null}
            {error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="shape-canvas">
            <ShapeEditor
              center={meta.city.center}
              neighborhoods={list}
              selectedId={selectedId}
              polygon={draft}
              drawing={drawing}
              selectedVertex={selectedVertex}
              onChange={setDraft}
              onSelectVertex={setSelectedVertex}
              onSelectNeighborhood={select}
              onRemoveVertex={remove}
              onFinishDrawing={() => setDrawing(false)}
            />
          </div>
          {(selected || creating) && !drawing && (
            <p className="hint">
              Arraste um ponto para mudar o limite. Arraste o ponto pequeno no meio de uma linha
              para criar outro. Clique duas vezes num ponto para apagá-lo.
            </p>
          )}
        </section>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Excluir este bairro?"
        message={`${selected?.name ?? "O bairro"} sai da lista e do mapa. Só dá para excluir um bairro sem equipamentos, agentes nem ocorrências.`}
        confirmLabel="Excluir bairro"
        onConfirm={destroy}
        onCancel={() => setConfirmDelete(false)}
      />
      <ZoneDialog
        open={zonesOpen}
        regions={meta.regions}
        neighborhoods={list}
        onClose={() => setZonesOpen(false)}
      />
    </main>
  );
}
