import { useMemo, useState } from "react";
import type { LngLat } from "../../shared/geo.ts";
import { fold } from "../../shared/text.ts";
import type { NeighborhoodShape } from "../../shared/types.ts";
import { api, ApiError } from "../api.ts";
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

type NewNeighborhood = { name: string; regionId: string };

function revealSelected(node: HTMLButtonElement | null): void {
  node?.scrollIntoView({ block: "nearest" });
}

export function NeighborhoodsPage() {
  const meta = useMeta();
  const shapes = useFetch<NeighborhoodShape[]>("/neighborhoods");
  const [saved, setSaved] = useState<Map<string, NeighborhoodShape | null>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState<NewNeighborhood | null>(null);
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
  const dirty =
    creating !== null
      ? draft.length > 0 || creating.name.trim() !== ""
      : selected !== null && (drawing || !sameShape(draft, selected.polygon));
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
    setCreating(null);
    setSelectedId(id);
    startEditing(list.find((item) => item.id === id)?.polygon ?? []);
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
    startEditing(shape.polygon);
    reloadMeta();
    showToast(message);
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? (reason.issues[0]?.message ?? reason.message)
          : "Não foi possível salvar o bairro.",
      );
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const shape = await api.put<NeighborhoodShape>(`/neighborhoods/${selectedId}/shape`, {
        polygon: draft,
      });
      store(shape, `Limite de ${shape.name} salvo.`);
    });

  const create = () =>
    run(async () => {
      const shape = await api.post<NeighborhoodShape>("/neighborhoods", {
        ...creating,
        polygon: draft,
      });
      setCreating(null);
      setSelectedId(shape.id);
      store(shape, `${shape.name} cadastrado.`);
    });

  const restore = () =>
    run(async () => {
      const shape = await api.delete<NeighborhoodShape>(`/neighborhoods/${selectedId}/shape`);
      store(shape, `${shape.name} voltou ao limite gerado a partir do OpenStreetMap.`);
    });

  const destroy = () => {
    setConfirmDelete(false);
    const target = selected;
    if (!target) {
      return;
    }
    void run(async () => {
      await api.delete(`/neighborhoods/${target.id}`);
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
        className="button button-small"
        disabled={draft.length === 0}
        onClick={() => setDraft(draft.slice(0, -1))}
      >
        Desfazer ponto
      </button>
      <button
        type="button"
        className="button button-small"
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
        className="button button-small"
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
        className="button button-small"
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

  return (
    <main className="page">
      <div className="page-head">
        <h1>Bairros</h1>
        <button type="button" className="button button-primary" onClick={startCreating}>
          Novo bairro
        </button>
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
                  {item.custom ? (
                    <span className="plate">Novo</span>
                  ) : (
                    item.edited && <span className="plate">Editado</span>
                  )}
                </button>
              </li>
            ))}
            {visible.length === 0 && <li className="empty">Nenhum bairro com esse nome.</li>}
          </ul>
        </section>
        <section className="shape-workspace" aria-label="Edição do limite">
          <div className="panel shape-toolbar">
            {creating ? (
              <>
                <div className="shape-title">
                  <h2>Novo bairro</h2>
                  {status}
                </div>
                <div className="shape-fields">
                  <div className="field">
                    <label htmlFor="new-neighborhood-name">Nome</label>
                    <input
                      id="new-neighborhood-name"
                      value={creating.name}
                      maxLength={80}
                      onChange={(event) => setCreating({ ...creating, name: event.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="new-neighborhood-region">Região</label>
                    <select
                      id="new-neighborhood-region"
                      value={creating.regionId}
                      onChange={(event) =>
                        setCreating({ ...creating, regionId: event.target.value })
                      }
                    >
                      <option value="">Selecione</option>
                      {meta.regions.map((region) => (
                        <option key={region.id} value={region.id}>
                          {region.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="shape-actions">
                  {drawingTools}
                  <button
                    type="button"
                    className="button button-small button-ghost"
                    onClick={discard}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="button button-small button-primary"
                    disabled={
                      drawing ||
                      problem !== null ||
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
                <div className="shape-actions">
                  {drawingTools}
                  {dirty && (
                    <button
                      type="button"
                      className="button button-small button-ghost"
                      onClick={discard}
                    >
                      Descartar
                    </button>
                  )}
                  {!dirty && selected.edited && (
                    <button
                      type="button"
                      className="button button-small"
                      disabled={busy}
                      onClick={() => void restore()}
                    >
                      Restaurar original
                    </button>
                  )}
                  {!dirty && selected.custom && (
                    <button
                      type="button"
                      className="button button-small button-danger"
                      disabled={busy}
                      onClick={() => setConfirmDelete(true)}
                    >
                      Excluir bairro
                    </button>
                  )}
                  <button
                    type="button"
                    className="button button-small button-primary"
                    disabled={!dirty || drawing || problem !== null || busy}
                    onClick={() => void save()}
                  >
                    Salvar limite
                  </button>
                </div>
              </>
            ) : (
              <p className="hint">
                Escolha um bairro na lista ou clique nele no mapa. Para criar um, use Novo bairro.
              </p>
            )}
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
          <p className="hint">
            {drawing
              ? "Clique no mapa para marcar cada ponto do limite. Para fechar, clique no primeiro ponto ou em Concluir desenho."
              : "Arraste um ponto para mudar o limite. Arraste o ponto pequeno no meio de uma linha para criar outro. Clique duas vezes num ponto para apagá-lo."}
          </p>
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
    </main>
  );
}
