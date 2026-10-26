import { useMemo, useState } from "react";
import type { LngLat } from "../../shared/geo.ts";
import type { NeighborhoodShape } from "../../shared/types.ts";
import { api, ApiError } from "../api.ts";
import { LoadingNotice } from "../components/LoadingNotice.tsx";
import { formatInteger } from "../format.ts";
import { reloadMeta, useMeta } from "../live.ts";
import { ShapeEditor } from "../map/ShapeEditor.tsx";
import { removeVertex, sameShape, shapeProblem, MIN_SHAPE_POINTS } from "../shapeEditing.ts";
import { showToast } from "../toast.tsx";
import { useFetch } from "../useFetch.ts";

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function NeighborhoodsPage() {
  const meta = useMeta();
  const shapes = useFetch<NeighborhoodShape[]>("/neighborhoods");
  const [saved, setSaved] = useState<Map<string, NeighborhoodShape>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LngLat[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [selectedVertex, setSelectedVertex] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useMemo(
    () => (shapes.data ?? []).map((item) => saved.get(item.id) ?? item),
    [shapes.data, saved],
  );
  const selected = list.find((item) => item.id === selectedId) ?? null;
  const dirty = selected !== null && (drawing || !sameShape(draft, selected.polygon));
  const problem = selected ? shapeProblem(draft) : null;
  const query = fold(search);
  const visible = list.filter((item) => fold(item.name).includes(query));

  if (!meta || !shapes.data) {
    return <LoadingNotice label="Carregando bairros..." />;
  }

  const select = (id: string) => {
    if (id === selectedId) {
      return;
    }
    if (dirty) {
      showToast("Salve ou descarte as mudanças antes de trocar de bairro.");
      return;
    }
    setSelectedId(id);
    startEditing(list.find((item) => item.id === id)?.polygon ?? []);
  };

  const startEditing = (polygon: LngLat[]) => {
    setDraft([...polygon]);
    setDrawing(false);
    setSelectedVertex(null);
    setError(null);
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

  const restore = () =>
    run(async () => {
      const shape = await api.delete<NeighborhoodShape>(`/neighborhoods/${selectedId}/shape`);
      store(shape, `${shape.name} voltou ao limite gerado a partir do OpenStreetMap.`);
    });

  const discard = () => startEditing(selected?.polygon ?? []);

  const remove = (index: number) => {
    if (draft.length <= MIN_SHAPE_POINTS) {
      showToast(`O bairro precisa de ao menos ${MIN_SHAPE_POINTS} pontos.`);
      return;
    }
    setDraft(removeVertex(draft, index));
    setSelectedVertex(null);
  };

  return (
    <main className="page">
      <div className="page-head">
        <h1>Bairros</h1>
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
                  aria-pressed={item.id === selectedId}
                  onClick={() => select(item.id)}
                >
                  <span>{item.name}</span>
                  {item.edited && <span className="plate">Editado</span>}
                </button>
              </li>
            ))}
            {visible.length === 0 && <li className="empty">Nenhum bairro com esse nome.</li>}
          </ul>
        </section>
        <section className="shape-workspace" aria-label="Edição do limite">
          <div className="panel shape-toolbar">
            {selected ? (
              <>
                <div className="shape-title">
                  <h2>{selected.name}</h2>
                  <p className="hint" role="status">
                    {problem ?? `${formatInteger(draft.length)} pontos`}
                    {dirty && !problem ? ", com mudanças não salvas" : ""}
                  </p>
                </div>
                <div className="shape-actions">
                  {drawing ? (
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
                  )}
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
                  <button
                    type="button"
                    className="button button-small button-primary"
                    disabled={!dirty || drawing || problem !== null || busy}
                    onClick={() => void save()}
                  >
                    Salvar limite
                  </button>
                </div>
                {error && (
                  <p className="error-box" role="alert">
                    {error}
                  </p>
                )}
              </>
            ) : (
              <p className="hint">Escolha um bairro na lista ou clique nele no mapa.</p>
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
    </main>
  );
}
