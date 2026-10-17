import { useEffect, useState, type FormEvent } from "react";
import {
  AGENCIES,
  AGENCY_LABELS,
  EQUIPMENT_STATUSES,
  EQUIPMENT_TYPES,
  EQUIPMENT_TYPE_KEYS,
  MAINTENANCE_LABELS,
  MAINTENANCE_NEEDS,
  STATUS_LABELS,
  type Agency,
  type AttributeSpec,
  type EquipmentStatus,
  type EquipmentType,
} from "../../shared/catalog.ts";
import { addDays, localDate } from "../../shared/time.ts";
import type { AddressLookup, Equipment } from "../../shared/types.ts";
import {
  LABELS,
  REFERENCE_SUGGESTIONS,
  emptyDraft,
  fromEquipment,
  toPayload,
  type Draft,
} from "./equipmentDraft.ts";
import { api, ApiError } from "../api.ts";
import {
  ConfirmDialog,
  ErrorSummary,
  Field,
  issuesToErrors,
  type Errors,
} from "../components/form.tsx";
import { useMeta } from "../live.ts";
import { LocationPicker } from "../map/LocationPicker.tsx";
import { Link, navigate } from "../router.tsx";
import { showToast } from "../toast.tsx";

function AttributeInput({
  spec,
  value,
  onChange,
  errors,
}: {
  spec: AttributeSpec;
  value: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
  errors: Errors;
}) {
  const path = `attributes.${spec.key}`;
  if (spec.kind === "boolean") {
    return (
      <label className="check">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        {spec.label}
      </label>
    );
  }
  return (
    <Field
      path={path}
      label={spec.kind === "number" && spec.unit ? `${spec.label} (${spec.unit})` : spec.label}
      error={errors[path]}
    >
      {(props) =>
        spec.kind === "select" ? (
          <select
            {...props}
            value={String(value ?? "")}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">Não informado</option>
            {Object.entries(spec.options).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        ) : (
          <input
            {...props}
            type={spec.kind === "number" ? "number" : "text"}
            min={spec.kind === "number" ? spec.min : undefined}
            max={spec.kind === "number" ? spec.max : undefined}
            maxLength={spec.kind === "text" ? spec.maxLength : undefined}
            value={String(value ?? "")}
            onChange={(event) => onChange(event.target.value)}
          />
        )
      }
    </Field>
  );
}

export function EquipmentFormPage({ id }: { id: number | null }) {
  const meta = useMeta();
  const [draft, setDraft] = useState<Draft>(() => emptyDraft("radar"));
  const [loaded, setLoaded] = useState(id === null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [lookup, setLookup] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (id === null) {
      return;
    }
    api
      .get<{ equipment: Equipment }>(`/equipment/${id}`)
      .then((data) => {
        setDraft(fromEquipment(data.equipment));
        setLoaded(true);
      })
      .catch((error: unknown) =>
        setLoadError(
          error instanceof ApiError ? error.message : "Não foi possível carregar o equipamento.",
        ),
      );
  }, [id]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const spec = EQUIPMENT_TYPES[draft.type];

  const changeType = (type: EquipmentType) =>
    setDraft((current) => ({
      ...current,
      type,
      agency: EQUIPMENT_TYPES[type].defaultAgency,
      maintenanceIntervalDays: String(EQUIPMENT_TYPES[type].maintenanceIntervalDays),
      attributes: {},
    }));

  const searchCep = async () => {
    setLookup("Buscando CEP...");
    try {
      const result = await api.get<AddressLookup>(`/address/${encodeURIComponent(draft.cep)}`);
      setDraft((current) => ({
        ...current,
        cep: result.cep,
        street: result.street || current.street,
        neighborhoodId: result.neighborhoodId ?? current.neighborhoodId,
        city: result.city || current.city,
        uf: result.uf || current.uf,
        lat: result.lat === null ? current.lat : result.lat.toFixed(6),
        lng: result.lng === null ? current.lng : result.lng.toFixed(6),
      }));
      setLookup(
        result.neighborhoodId
          ? `Endereço preenchido (${result.source === "local" ? "base local" : "ViaCEP"}). Ajuste o ponto no mapa se precisar.`
          : `Endereço encontrado, mas o bairro "${result.neighborhoodName}" não está no cadastro. Escolha o bairro mais próximo.`,
      );
    } catch (error) {
      setLookup(
        error instanceof ApiError && error.status === 404
          ? "CEP não encontrado. Preencha o endereço manualmente."
          : "Não foi possível consultar o CEP agora.",
      );
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const payload = toPayload(draft);
      const saved =
        id === null
          ? await api.post<Equipment>("/equipment", payload)
          : await api.put<Equipment>(`/equipment/${id}`, payload);
      showToast(
        id === null
          ? `Equipamento ${saved.serialNumber} cadastrado.`
          : `Equipamento ${saved.serialNumber} atualizado.`,
      );
      navigate("/equipamentos");
    } catch (error) {
      setErrors(
        error instanceof ApiError && error.issues.length > 0
          ? issuesToErrors(error.issues)
          : { form: error instanceof ApiError ? error.message : "Não foi possível salvar." },
      );
      setSaving(false);
    }
  };

  const remove = async () => {
    setConfirmDelete(false);
    try {
      await api.delete(`/equipment/${id}`);
      showToast(`Equipamento ${draft.serialNumber} excluído.`);
      navigate("/equipamentos");
    } catch (error) {
      setErrors({ form: error instanceof ApiError ? error.message : "Não foi possível excluir." });
    }
  };

  if (loadError) {
    return (
      <main className="page">
        <p className="error-box">{loadError}</p>
        <Link href="/equipamentos">Voltar para a lista</Link>
      </main>
    );
  }
  if (!meta || !loaded) {
    return (
      <main className="page">
        <p className="hint" role="status">
          Carregando...
        </p>
      </main>
    );
  }

  const location =
    draft.lat &&
    draft.lng &&
    Number.isFinite(Number(draft.lat)) &&
    Number.isFinite(Number(draft.lng))
      ? { lat: Number(draft.lat), lng: Number(draft.lng) }
      : null;
  const attributeLabels = Object.fromEntries(
    spec.attributes.map((item) => [`attributes.${item.key}`, item.label]),
  );

  return (
    <main className="page" style={{ maxWidth: 1100 }}>
      <div className="page-head">
        <div>
          <h1>{id === null ? "Cadastrar equipamento" : `Editar ${draft.serialNumber}`}</h1>
          <p>Os campos de características mudam conforme o tipo de equipamento.</p>
        </div>
        <Link href="/equipamentos" className="button">
          Voltar para a lista
        </Link>
      </div>
      <form
        onSubmit={(event) => void submit(event)}
        noValidate
        style={{ display: "grid", gap: 16 }}
      >
        <ErrorSummary errors={errors} labels={{ ...LABELS, ...attributeLabels }} />
        <fieldset className="form-section">
          <legend>Identificação</legend>
          <div className="form-grid">
            <Field path="type" label={LABELS["type"]!} error={errors["type"]}>
              {(props) => (
                <select
                  {...props}
                  value={draft.type}
                  onChange={(event) => changeType(event.target.value as EquipmentType)}
                >
                  {EQUIPMENT_TYPE_KEYS.map((type) => (
                    <option key={type} value={type}>
                      {EQUIPMENT_TYPES[type].label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field
              path="serialNumber"
              label={LABELS["serialNumber"]!}
              error={errors["serialNumber"]}
            >
              {(props) => (
                <input
                  {...props}
                  value={draft.serialNumber}
                  onChange={(event) => set("serialNumber", event.target.value)}
                  autoComplete="off"
                />
              )}
            </Field>
            <Field path="brand" label={LABELS["brand"]!} error={errors["brand"]}>
              {(props) => (
                <input
                  {...props}
                  value={draft.brand}
                  onChange={(event) => set("brand", event.target.value)}
                />
              )}
            </Field>
            <Field path="model" label={LABELS["model"]!} error={errors["model"]}>
              {(props) => (
                <input
                  {...props}
                  value={draft.model}
                  onChange={(event) => set("model", event.target.value)}
                />
              )}
            </Field>
            <Field path="agency" label={LABELS["agency"]!} error={errors["agency"]}>
              {(props) => (
                <select
                  {...props}
                  value={draft.agency}
                  onChange={(event) => set("agency", event.target.value as Agency)}
                >
                  {AGENCIES.map((agency) => (
                    <option key={agency} value={agency}>
                      {AGENCY_LABELS[agency]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field path="status" label={LABELS["status"]!} error={errors["status"]}>
              {(props) => (
                <select
                  {...props}
                  value={draft.status}
                  onChange={(event) => {
                    const status = event.target.value as EquipmentStatus;
                    setDraft((current) => ({
                      ...current,
                      status,
                      installedAt:
                        status === "not_installed"
                          ? ""
                          : current.installedAt || localDate(Date.now()),
                      maintenanceNeed:
                        status === "malfunction" ? "immediate" : current.maintenanceNeed,
                    }));
                  }}
                >
                  {EQUIPMENT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field path="installedAt" label={LABELS["installedAt"]!} error={errors["installedAt"]}>
              {(props) => (
                <input
                  {...props}
                  type="date"
                  value={draft.installedAt}
                  disabled={draft.status === "not_installed"}
                  onChange={(event) => set("installedAt", event.target.value)}
                />
              )}
            </Field>
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend>{spec.mobile ? "Localização da base" : "Localização de instalação"}</legend>
          <div className="form-grid">
            <Field
              path="cep"
              label={LABELS["cep"]!}
              error={errors["cep"]}
              hint="Busque o CEP para preencher rua, bairro e coordenadas."
            >
              {(props) => (
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    {...props}
                    inputMode="numeric"
                    value={draft.cep}
                    placeholder="17500-000"
                    onChange={(event) => set("cep", event.target.value)}
                  />
                  <button
                    type="button"
                    className="button"
                    onClick={() => void searchCep()}
                    disabled={draft.cep.replaceAll(/\D/g, "").length !== 8}
                  >
                    Buscar CEP
                  </button>
                </div>
              )}
            </Field>
            <Field path="street" label={LABELS["street"]!} error={errors["street"]}>
              {(props) => (
                <input
                  {...props}
                  value={draft.street}
                  onChange={(event) => set("street", event.target.value)}
                />
              )}
            </Field>
            <Field
              path="reference"
              label={LABELS["reference"]!}
              error={errors["reference"]}
              hint='Ex.: "número 181", "KM 203", "S/N", "em frente ao Mercado do Tio".'
            >
              {(props) => (
                <>
                  <input
                    {...props}
                    list="reference-suggestions"
                    value={draft.reference}
                    onChange={(event) => set("reference", event.target.value)}
                  />
                  <datalist id="reference-suggestions">
                    {REFERENCE_SUGGESTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item.trim()}
                      </option>
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <Field
              path="neighborhoodId"
              label={LABELS["neighborhoodId"]!}
              error={errors["neighborhoodId"]}
            >
              {(props) => (
                <select
                  {...props}
                  value={draft.neighborhoodId}
                  onChange={(event) => set("neighborhoodId", event.target.value)}
                >
                  <option value="">Selecione o bairro</option>
                  {meta.neighborhoods.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field path="city" label={LABELS["city"]!} error={errors["city"]}>
              {(props) => (
                <input
                  {...props}
                  value={draft.city}
                  onChange={(event) => set("city", event.target.value)}
                />
              )}
            </Field>
            <Field path="uf" label={LABELS["uf"]!} error={errors["uf"]}>
              {(props) => (
                <input
                  {...props}
                  maxLength={2}
                  value={draft.uf}
                  onChange={(event) => set("uf", event.target.value.toUpperCase())}
                />
              )}
            </Field>
            <Field path="lat" label={LABELS["lat"]!} error={errors["lat"]}>
              {(props) => (
                <input
                  {...props}
                  inputMode="decimal"
                  value={draft.lat}
                  onChange={(event) => set("lat", event.target.value)}
                />
              )}
            </Field>
            <Field path="lng" label={LABELS["lng"]!} error={errors["lng"]}>
              {(props) => (
                <input
                  {...props}
                  inputMode="decimal"
                  value={draft.lng}
                  onChange={(event) => set("lng", event.target.value)}
                />
              )}
            </Field>
          </div>
          {lookup && (
            <p className="hint" role="status">
              {lookup}
            </p>
          )}
          <LocationPicker
            center={meta.city.center}
            value={location}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                lat: value.lat.toFixed(6),
                lng: value.lng.toFixed(6),
              }))
            }
          />
          <p className="hint">
            Clique no mapa ou arraste o marcador amarelo para ajustar as coordenadas GPS.
          </p>
        </fieldset>

        <fieldset className="form-section">
          <legend>Manutenção</legend>
          <div className="field">
            <span className="label">{LABELS["maintenanceNeed"]}</span>
            <div className="chip-group" role="radiogroup" aria-label={LABELS["maintenanceNeed"]}>
              {MAINTENANCE_NEEDS.map((need) => (
                <label key={need} className="check" style={{ marginRight: 12 }}>
                  <input
                    type="radio"
                    name="maintenanceNeed"
                    checked={draft.maintenanceNeed === need}
                    onChange={() => set("maintenanceNeed", need)}
                  />
                  {MAINTENANCE_LABELS[need]}
                </label>
              ))}
            </div>
          </div>
          <div className="form-grid">
            <Field
              path="maintenanceIntervalDays"
              label={`${LABELS["maintenanceIntervalDays"]} (dias)`}
              error={errors["maintenanceIntervalDays"]}
            >
              {(props) => (
                <input
                  {...props}
                  type="number"
                  min={1}
                  max={1095}
                  value={draft.maintenanceIntervalDays}
                  onChange={(event) => set("maintenanceIntervalDays", event.target.value)}
                />
              )}
            </Field>
            <Field
              path="lastMaintenanceAt"
              label={LABELS["lastMaintenanceAt"]!}
              error={errors["lastMaintenanceAt"]}
            >
              {(props) => (
                <input
                  {...props}
                  type="date"
                  value={draft.lastMaintenanceAt}
                  onChange={(event) => set("lastMaintenanceAt", event.target.value)}
                />
              )}
            </Field>
            <Field
              path="nextMaintenanceAt"
              label={LABELS["nextMaintenanceAt"]!}
              error={errors["nextMaintenanceAt"]}
            >
              {(props) => (
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    {...props}
                    type="date"
                    value={draft.nextMaintenanceAt}
                    onChange={(event) => set("nextMaintenanceAt", event.target.value)}
                  />
                  <button
                    type="button"
                    className="button"
                    disabled={!draft.maintenanceIntervalDays}
                    onClick={() =>
                      set(
                        "nextMaintenanceAt",
                        addDays(
                          draft.lastMaintenanceAt || localDate(Date.now()),
                          Number(draft.maintenanceIntervalDays),
                        ),
                      )
                    }
                  >
                    Calcular
                  </button>
                </div>
              )}
            </Field>
          </div>
          <Field
            path="maintenanceNotes"
            label={LABELS["maintenanceNotes"]!}
            error={errors["maintenanceNotes"]}
          >
            {(props) => (
              <textarea
                {...props}
                maxLength={500}
                value={draft.maintenanceNotes}
                onChange={(event) => set("maintenanceNotes", event.target.value)}
              />
            )}
          </Field>
        </fieldset>

        <fieldset className="form-section">
          <legend>Características: {spec.label.toLowerCase()}</legend>
          <div className="form-grid">
            {spec.attributes.map((attribute) => (
              <AttributeInput
                key={attribute.key}
                spec={attribute}
                value={draft.attributes[attribute.key]}
                errors={errors}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    attributes: { ...current.attributes, [attribute.key]: value },
                  }))
                }
              />
            ))}
          </div>
        </fieldset>

        <div className="form-actions">
          {id !== null && (
            <button
              type="button"
              className="button button-danger"
              onClick={() => setConfirmDelete(true)}
              style={{ marginRight: "auto" }}
            >
              Excluir equipamento
            </button>
          )}
          <Link href="/equipamentos" className="button">
            Cancelar
          </Link>
          <button type="submit" className="button button-primary" disabled={saving}>
            {saving ? "Salvando..." : id === null ? "Cadastrar equipamento" : "Salvar alterações"}
          </button>
        </div>
      </form>
      <ConfirmDialog
        open={confirmDelete}
        title="Excluir este equipamento?"
        message={`O equipamento ${draft.serialNumber} e todo o histórico de telemetria dele serão apagados. Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir equipamento"
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </main>
  );
}
