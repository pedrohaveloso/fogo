import { useState } from "react";
import { centroid, type LngLat } from "../../shared/geo.ts";
import { STATE_CODES, STATES } from "../../shared/states.ts";
import { plural } from "../../shared/text.ts";
import type { BoundaryLookup, CityDetail, Municipality } from "../../shared/types.ts";
import { api, ApiError, errorMessage } from "../api.ts";
import { cityPath } from "../cityScope.ts";
import {
  ConfirmDialog,
  Field,
  FormActions,
  issuesToErrors,
  type Errors,
} from "../components/form.tsx";
import { LoadingNotice } from "../components/LoadingNotice.tsx";
import { Select } from "../components/Select.tsx";
import { formatInteger } from "../format.ts";
import { ShapeEditor } from "../map/ShapeEditor.tsx";
import { Link, navigate } from "../router.tsx";
import { chooseCity, loadSession } from "../session.ts";
import { MIN_SHAPE_POINTS, removeVertex, shapeProblem } from "../shapeEditing.ts";
import { showToast } from "../toast.tsx";
import { useFetch } from "../useFetch.ts";

const BRAZIL_CENTER: LngLat = [-51.9, -14.2];

type Lookup = { message: string; problem: boolean } | null;

function useBoundaryEditor(initial: LngLat[]) {
  const [polygon, setPolygon] = useState<LngLat[]>(initial);
  const [drawing, setDrawing] = useState(false);
  const [selectedVertex, setSelectedVertex] = useState<number | null>(null);
  const [view, setView] = useState(initial.length > 0 ? 1 : 0);

  const replace = (next: LngLat[]) => {
    setPolygon(next);
    setDrawing(next.length === 0);
    setSelectedVertex(null);
    setView((value) => value + 1);
  };

  const remove = (index: number) => {
    if (polygon.length <= MIN_SHAPE_POINTS) {
      showToast(`O limite precisa de ao menos ${MIN_SHAPE_POINTS} pontos.`);
      return;
    }
    setPolygon(removeVertex(polygon, index));
    setSelectedVertex(null);
  };

  return {
    polygon,
    drawing,
    selectedVertex,
    view,
    replace,
    remove,
    setPolygon,
    setDrawing,
    setSelectedVertex,
  };
}

function BoundaryMap({
  editor,
  center,
}: {
  editor: ReturnType<typeof useBoundaryEditor>;
  center: LngLat;
}) {
  const problem = shapeProblem(editor.polygon);
  return (
    <div className="stack">
      <div className="shape-actions">
        {editor.drawing ? (
          <>
            <button
              type="button"
              className="button"
              disabled={editor.polygon.length === 0}
              onClick={() => editor.setPolygon(editor.polygon.slice(0, -1))}
            >
              Desfazer ponto
            </button>
            <button
              type="button"
              className="button"
              disabled={editor.polygon.length < MIN_SHAPE_POINTS}
              onClick={() => editor.setDrawing(false)}
            >
              Concluir desenho
            </button>
          </>
        ) : (
          <>
            <button type="button" className="button" onClick={() => editor.replace([])}>
              Redesenhar
            </button>
            <button
              type="button"
              className="button"
              disabled={editor.selectedVertex === null}
              onClick={() => editor.selectedVertex !== null && editor.remove(editor.selectedVertex)}
            >
              Apagar ponto
            </button>
          </>
        )}
        <span className="hint" role="status">
          {problem ?? `${formatInteger(editor.polygon.length)} pontos`}
        </span>
      </div>
      <div className="city-canvas">
        <ShapeEditor
          center={center}
          zoom={editor.polygon.length >= MIN_SHAPE_POINTS ? 11 : 4}
          neighborhoods={[]}
          selectedId={editor.view > 0 ? `view-${editor.view}` : null}
          polygon={editor.polygon}
          drawing={editor.drawing}
          selectedVertex={editor.selectedVertex}
          onChange={editor.setPolygon}
          onSelectVertex={editor.setSelectedVertex}
          onSelectNeighborhood={() => {}}
          onRemoveVertex={editor.remove}
          onFinishDrawing={() => editor.setDrawing(false)}
          label="Mapa do limite da cidade. Arraste os pontos para mudar o limite."
        />
      </div>
    </div>
  );
}

function boundaryReady(polygon: LngLat[], drawing: boolean): boolean {
  return !drawing && polygon.length >= MIN_SHAPE_POINTS && shapeProblem(polygon) === null;
}

function NewCity() {
  const [uf, setUf] = useState("");
  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState<Lookup>(null);
  const [placeCenter, setPlaceCenter] = useState<LngLat | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const editor = useBoundaryEditor([]);
  const municipalities = useFetch<Municipality[]>(
    uf ? `/places/states/${uf}/municipalities` : null,
  );
  const municipality = municipalities.data?.find((item) => String(item.ibgeCode) === code) ?? null;

  const chooseMunicipality = async (value: string) => {
    setCode(value);
    editor.replace([]);
    setPlaceCenter(null);
    const chosen = municipalities.data?.find((item) => String(item.ibgeCode) === value);
    if (!chosen) {
      setLookup(null);
      return;
    }
    setLookup({ message: "Buscando o limite no OpenStreetMap...", problem: false });
    const params = new URLSearchParams({ name: chosen.name, uf, ibgeCode: value });
    try {
      const found = await api.get<BoundaryLookup>(`/places/boundary?${params.toString()}`);
      editor.replace(found.boundary);
      setPlaceCenter(found.center);
      setLookup({
        message: "Limite trazido do OpenStreetMap. Confira no mapa e ajuste se precisar.",
        problem: false,
      });
    } catch (error) {
      setLookup({
        message: `${errorMessage(error, "Não foi possível buscar o limite.")} Desenhe o limite no mapa.`,
        problem: true,
      });
    }
  };

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      const city = await api.post<CityDetail>("/cities", {
        ibgeCode: Number(code),
        name: municipality?.name ?? "",
        uf,
        boundary: editor.polygon,
        center: placeCenter,
      });
      await chooseCity(city.id);
      showToast(`${city.name} cadastrada. Comece pelas zonas e bairros.`);
      navigate("/neighborhoods");
    } catch (error) {
      setErrors(
        error instanceof ApiError && error.issues.length > 0
          ? issuesToErrors(error.issues)
          : { form: errorMessage(error, "Não foi possível cadastrar a cidade.") },
      );
      setBusy(false);
    }
  };

  const center = editor.polygon.length > 0 ? centroid(editor.polygon) : BRAZIL_CENTER;

  return (
    <main className="page">
      <div className="page-head">
        <h1>Cadastrar cidade</h1>
        <Link href="/cities" className="button">
          Voltar para a lista
        </Link>
      </div>
      <div className="form">
        {(errors["form"] ?? errors["boundary"]) && (
          <p className="error-box" role="alert">
            {errors["form"] ?? errors["boundary"]}
          </p>
        )}
        <fieldset className="form-section">
          <legend>Município</legend>
          <div className="form-grid">
            <Field path="uf" label="UF" error={errors["uf"]}>
              {(props) => (
                <Select
                  {...props}
                  value={uf}
                  placeholder="Selecione a UF"
                  options={STATE_CODES.map((item) => ({
                    value: item,
                    label: `${item} (${STATES[item]})`,
                  }))}
                  onChange={(value) => {
                    setUf(value);
                    setCode("");
                    setLookup(null);
                    editor.replace([]);
                  }}
                />
              )}
            </Field>
            <Field
              path="ibgeCode"
              label="Município"
              error={errors["ibgeCode"] ?? municipalities.error ?? undefined}
              status={lookup}
            >
              {(props) => (
                <Select
                  {...props}
                  value={code}
                  disabled={!municipalities.data}
                  placeholder={
                    uf === ""
                      ? "Escolha a UF antes"
                      : municipalities.data
                        ? "Selecione o município"
                        : "Carregando municípios..."
                  }
                  options={(municipalities.data ?? []).map((item) => ({
                    value: String(item.ibgeCode),
                    label: item.name,
                  }))}
                  onChange={(value) => void chooseMunicipality(value)}
                />
              )}
            </Field>
          </div>
        </fieldset>
        {municipality && (
          <fieldset className="form-section">
            <legend>Limite</legend>
            <BoundaryMap editor={editor} center={center} />
          </fieldset>
        )}
        <FormActions>
          <Link href="/cities" className="button">
            Cancelar
          </Link>
          <button
            type="button"
            className="button button-primary"
            disabled={busy || !municipality || !boundaryReady(editor.polygon, editor.drawing)}
            onClick={() => void save()}
          >
            {busy ? "Salvando..." : "Cadastrar cidade"}
          </button>
        </FormActions>
      </div>
    </main>
  );
}

function EditCity({ city }: { city: CityDetail }) {
  const editor = useBoundaryEditor(city.boundary);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inUse = city.equipment + city.agents > 0;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.put(cityPath("/boundary", city.id), { boundary: editor.polygon });
      showToast(`Limite de ${city.name} salvo.`);
      navigate("/cities");
    } catch (reason) {
      setError(errorMessage(reason, "Não foi possível salvar o limite."));
      setBusy(false);
    }
  };

  const remove = async () => {
    setConfirmDelete(false);
    try {
      await api.delete(cityPath("", city.id));
      await loadSession();
      showToast(`${city.name} excluída.`);
      navigate("/cities");
    } catch (reason) {
      setError(errorMessage(reason, "Não foi possível excluir a cidade."));
    }
  };

  return (
    <main className="page">
      <div className="page-head">
        <h1>
          {city.name}, {city.uf}
        </h1>
        <Link href="/cities" className="button">
          Voltar para a lista
        </Link>
      </div>
      <div className="form">
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        <fieldset className="form-section">
          <legend>Limite</legend>
          <BoundaryMap editor={editor} center={city.center} />
        </fieldset>
        <FormActions>
          <button
            type="button"
            className="button button-danger"
            disabled={inUse}
            title={
              inUse
                ? `Há ${formatInteger(city.equipment)} ${plural(city.equipment, "equipamento", "equipamentos")} e ${formatInteger(city.agents)} ${plural(city.agents, "agente", "agentes")} nesta cidade.`
                : undefined
            }
            onClick={() => setConfirmDelete(true)}
          >
            Excluir cidade
          </button>
          <Link href="/cities" className="button">
            Cancelar
          </Link>
          <button
            type="button"
            className="button button-primary"
            disabled={busy || !boundaryReady(editor.polygon, editor.drawing)}
            onClick={() => void save()}
          >
            {busy ? "Salvando..." : "Salvar limite"}
          </button>
        </FormActions>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Excluir esta cidade?"
        message={`${city.name} sai do FOGO junto com zonas, bairros e órgãos. Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir cidade"
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </main>
  );
}

export function CityFormPage({ id }: { id: number | null }) {
  const detail = useFetch<CityDetail>(id === null ? null : cityPath("", id));
  if (id === null) {
    return <NewCity />;
  }
  if (detail.error && !detail.data) {
    return (
      <main className="page">
        <p className="error-box">{detail.error}</p>
        <Link href="/cities">Voltar para a lista</Link>
      </main>
    );
  }
  if (!detail.data) {
    return <LoadingNotice label="Carregando cidade..." onRetry={detail.reload} />;
  }
  return <EditCity city={detail.data} />;
}
