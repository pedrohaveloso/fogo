import { useEffect, useState, type FormEvent } from "react";
import {
  EQUIPMENT_STATUSES,
  EQUIPMENT_TYPES,
  EQUIPMENT_TYPE_KEYS,
  MAINTENANCE_LABELS,
  MAINTENANCE_NEEDS,
  STATUS_COLORS,
  STATUS_LABELS,
  type AttributeSpec,
  type EquipmentStatus,
  type EquipmentType,
} from "../../shared/catalog.ts";
import { addDays, localDate } from "../../shared/time.ts";
import type { AddressLookup, Equipment, Meta, Tag } from "../../shared/types.ts";
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
  OptionGroup,
  issuesToErrors,
  type Errors,
} from "../components/form.tsx";
import { Glyph, StatusShape, TYPE_GLYPHS } from "../icons.tsx";
import { LoadingNotice } from "../components/LoadingNotice.tsx";
import { Select } from "../components/Select.tsx";
import { TagPanel } from "../components/TagPanel.tsx";
import { useMeta } from "../live.ts";
import { LocationPicker } from "../map/LocationPicker.tsx";
import { containingArea } from "../../shared/geo.ts";
import { Link, navigate } from "../router.tsx";
import { showToast } from "../toast.tsx";
import { cityPath, currentCityId } from "../cityScope.ts";
import { useSession } from "../session.ts";
import { useFetch } from "../useFetch.ts";

type LookupStatus = { message: string; problem: boolean };

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
          <Select
            {...props}
            value={String(value ?? "")}
            options={[
              { value: "", label: "Não informado" },
              ...Object.entries(spec.options).map(([key, label]) => ({ value: key, label })),
            ]}
            onChange={onChange}
          />
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
  const currentMeta = useMeta();
  const cities = useSession().session?.cities ?? [];
  const [draft, setDraft] = useState<Draft>(() => emptyDraft("radar", currentCityId()));
  const [pendingUf, setPendingUf] = useState("");
  const [loaded, setLoaded] = useState(id === null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [lookup, setLookup] = useState<LookupStatus | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tag, setTag] = useState<Tag | null>(null);

  useEffect(() => {
    if (id === null) {
      return;
    }
    api
      .get<{ equipment: Equipment; tag: Tag | null }>(cityPath(`/equipment/${id}`))
      .then((data) => {
        setDraft(fromEquipment(data.equipment));
        setTag(data.tag);
        setLoaded(true);
      })
      .catch((error: unknown) =>
        setLoadError(
          error instanceof ApiError ? error.message : "Não foi possível carregar o equipamento.",
        ),
      );
  }, [id]);

  const otherCity = draft.cityId !== null && draft.cityId !== currentCityId();
  const otherMeta = useFetch<Meta>(otherCity ? cityPath("/meta", draft.cityId) : null);
  const meta = draft.cityId === null ? null : otherCity ? otherMeta.data : currentMeta;
  const uf = cities.find((item) => item.id === draft.cityId)?.uf ?? pendingUf;
  const states = [...new Set(cities.map((item) => item.uf))].sort();
  const citiesOfState = cities.filter((item) => item.uf === uf);

  const changeCity = (cityId: number | null) =>
    setDraft((current) => ({
      ...current,
      cityId,
      agencyId: "",
      neighborhoodId: "",
      lat: "",
      lng: "",
    }));

  const changeState = (value: string) => {
    setPendingUf(value);
    const options = cities.filter((item) => item.uf === value);
    changeCity(options.length === 1 ? options[0]!.id : null);
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const spec = EQUIPMENT_TYPES[draft.type];

  const changeType = (type: EquipmentType) =>
    setDraft((current) => ({
      ...current,
      type,
      maintenanceIntervalDays: String(EQUIPMENT_TYPES[type].maintenanceIntervalDays),
      attributes: {},
    }));

  const changeStatus = (status: EquipmentStatus) =>
    setDraft((current) => ({
      ...current,
      status,
      installedAt: status === "not_installed" ? "" : current.installedAt || localDate(Date.now()),
      maintenanceNeed: status === "malfunction" ? "immediate" : current.maintenanceNeed,
    }));

  const searchCep = async () => {
    if (draft.cityId === null) {
      setLookup({ message: "Escolha a cidade antes de buscar o CEP.", problem: true });
      return;
    }
    if (draft.cep.replaceAll(/\D/g, "").length !== 8) {
      setLookup({ message: "Digite os 8 números do CEP para buscar.", problem: true });
      return;
    }
    setLookup({ message: "Buscando CEP...", problem: false });
    try {
      const result = await api.get<AddressLookup>(
        cityPath(`/address/${encodeURIComponent(draft.cep)}`, draft.cityId),
      );
      setDraft((current) => ({
        ...current,
        cep: result.cep,
        street: result.street || current.street,
        neighborhoodId: result.neighborhoodId ?? current.neighborhoodId,
        lat: result.lat === null ? current.lat : result.lat.toFixed(6),
        lng: result.lng === null ? current.lng : result.lng.toFixed(6),
      }));
      const cityName = meta?.city.name ?? "";
      const elsewhere =
        result.cityName !== "" && (result.cityName !== cityName || result.uf !== meta?.city.uf);
      setLookup(
        elsewhere
          ? {
              message: `Este CEP é de ${result.cityName}/${result.uf}, não de ${cityName}. Confira o número ou escolha outra cidade.`,
              problem: true,
            }
          : result.neighborhoodId
            ? {
                message: `Endereço preenchido (${result.source === "local" ? "base local" : "ViaCEP"}). Ajuste o ponto no mapa se precisar.`,
                problem: false,
              }
            : {
                message: `O bairro "${result.neighborhoodName}" não está no cadastro. Escolha o mais próximo.`,
                problem: false,
              },
      );
    } catch (error) {
      setLookup({
        message:
          error instanceof ApiError && error.status === 404
            ? `Não encontramos o CEP ${draft.cep}. Confira os números ou preencha o endereço à mão.`
            : `Não foi possível consultar o CEP ${draft.cep} agora. Tente de novo ou preencha à mão.`,
        problem: true,
      });
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
          ? await api.post<Equipment>(cityPath("/equipment"), payload)
          : await api.put<Equipment>(cityPath(`/equipment/${id}`), payload);
      showToast(
        id === null
          ? `Equipamento ${saved.serialNumber} cadastrado.`
          : `Equipamento ${saved.serialNumber} atualizado.`,
      );
      navigate("/equipment");
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
      await api.delete(cityPath(`/equipment/${id}`));
      showToast(`Equipamento ${draft.serialNumber} excluído.`);
      navigate("/equipment");
    } catch (error) {
      setErrors({ form: error instanceof ApiError ? error.message : "Não foi possível excluir." });
    }
  };

  if (loadError) {
    return (
      <main className="page">
        <p className="error-box">{loadError}</p>
        <Link href="/equipment">Voltar para a lista</Link>
      </main>
    );
  }
  if (!currentMeta || !loaded || (draft.cityId !== null && !meta)) {
    return <LoadingNotice label="Carregando..." onRetry={() => window.location.reload()} />;
  }
  const neighborhoods = meta?.neighborhoods ?? [];
  const agencies = meta?.agencies ?? [];

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
    <main className="page">
      <div className="page-head">
        <h1>{id === null ? "Cadastrar equipamento" : `Editar ${draft.serialNumber}`}</h1>
        <Link href="/equipment" className="button">
          Voltar para a lista
        </Link>
      </div>
      <form className="form" onSubmit={(event) => void submit(event)} noValidate>
        <ErrorSummary errors={errors} labels={{ ...LABELS, ...attributeLabels }} />
        <fieldset className="form-section">
          <legend>Identificação</legend>
          <OptionGroup
            name="type"
            label={LABELS["type"]!}
            error={errors["type"]}
            value={draft.type}
            onChange={changeType}
            options={EQUIPMENT_TYPE_KEYS.map((type) => ({
              value: type,
              label: EQUIPMENT_TYPES[type].label,
              icon: <Glyph d={TYPE_GLYPHS[type]} size={20} />,
            }))}
          />
          <div className="form-grid">
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
            <Field path="agencyId" label={LABELS["agencyId"]!} error={errors["agencyId"]}>
              {(props) => (
                <Select
                  {...props}
                  value={draft.agencyId}
                  placeholder={
                    draft.cityId === null ? "Escolha a cidade antes" : "Selecione o órgão"
                  }
                  options={agencies.map((agency) => ({
                    value: String(agency.id),
                    label: agency.name,
                  }))}
                  onChange={(value) => set("agencyId", value)}
                />
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
          <OptionGroup
            name="status"
            label={LABELS["status"]!}
            error={errors["status"]}
            value={draft.status}
            onChange={changeStatus}
            compact
            options={EQUIPMENT_STATUSES.map((status) => ({
              value: status,
              label: STATUS_LABELS[status],
              icon: <StatusShape status={status} color={STATUS_COLORS[status]} size={14} />,
            }))}
          />
        </fieldset>

        <fieldset className="form-section">
          <legend>{spec.mobile ? "Localização da base" : "Localização de instalação"}</legend>
          <div className="form-grid">
            <Field path="uf" label={LABELS["uf"]!} error={errors["uf"]}>
              {(props) => (
                <Select
                  {...props}
                  value={uf}
                  placeholder="Selecione a UF"
                  options={states.map((item) => ({ value: item, label: item }))}
                  onChange={changeState}
                />
              )}
            </Field>
            <Field path="cityId" label={LABELS["cityId"]!} error={errors["cityId"]}>
              {(props) => (
                <Select
                  {...props}
                  value={draft.cityId === null ? "" : String(draft.cityId)}
                  placeholder="Selecione a cidade"
                  options={citiesOfState.map((item) => ({
                    value: String(item.id),
                    label: item.name,
                  }))}
                  onChange={(value) => changeCity(value === "" ? null : Number(value))}
                />
              )}
            </Field>
            <Field path="cep" label={LABELS["cep"]!} error={errors["cep"]} status={lookup}>
              {(props) => (
                <div className="input-row">
                  <input
                    {...props}
                    inputMode="numeric"
                    autoComplete="postal-code"
                    value={draft.cep}
                    onChange={(event) => set("cep", event.target.value)}
                  />
                  <button type="button" className="button" onClick={() => void searchCep()}>
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
            <Field path="reference" label={LABELS["reference"]!} error={errors["reference"]}>
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
                <Select
                  {...props}
                  value={draft.neighborhoodId}
                  placeholder="Selecione o bairro"
                  options={neighborhoods.map((item) => ({ value: item.id, label: item.name }))}
                  onChange={(value) => set("neighborhoodId", value)}
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
          <LocationPicker
            center={(meta ?? currentMeta).city.center}
            value={location}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                lat: value.lat.toFixed(6),
                lng: value.lng.toFixed(6),
                neighborhoodId:
                  containingArea(neighborhoods, [value.lng, value.lat])?.id ??
                  current.neighborhoodId,
              }))
            }
          />
          <p className="hint">
            O bairro acompanha o ponto escolhido. Clique no mapa ou arraste o marcador para ajustar
            as coordenadas GPS.
          </p>
        </fieldset>

        <fieldset className="form-section">
          <legend>Manutenção</legend>
          <OptionGroup
            name="maintenanceNeed"
            label={LABELS["maintenanceNeed"]!}
            error={errors["maintenanceNeed"]}
            value={draft.maintenanceNeed}
            onChange={(need) => set("maintenanceNeed", need)}
            compact
            options={MAINTENANCE_NEEDS.map((need) => ({
              value: need,
              label: MAINTENANCE_LABELS[need],
            }))}
          />
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
                <div className="input-row">
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
            >
              Excluir equipamento
            </button>
          )}
          <Link href="/equipment" className="button">
            Cancelar
          </Link>
          <button type="submit" className="button button-primary" disabled={saving}>
            {saving ? "Salvando..." : id === null ? "Cadastrar equipamento" : "Salvar alterações"}
          </button>
        </div>
      </form>
      {id !== null && <TagPanel target={{ equipmentId: id }} initial={tag} moves={spec.mobile} />}
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
