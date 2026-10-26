import { useEffect, useState, type FormEvent } from "react";
import {
  AGENT_ROLES,
  AGENT_ROLE_KEYS,
  AGENT_STATUSES,
  AGENT_STATUS_LABELS,
  EQUIPMENT_TYPES,
  SHIFTS,
  SHIFT_KEYS,
  type AgentRole,
  type AgentStatus,
  type Shift,
} from "../../shared/catalog.ts";
import type { Agent, Tag } from "../../shared/types.ts";
import { api, ApiError } from "../api.ts";
import {
  ConfirmDialog,
  ErrorSummary,
  Field,
  OptionGroup,
  issuesToErrors,
  type Errors,
} from "../components/form.tsx";
import { AgentShield } from "../components/badges.tsx";
import { LoadingNotice } from "../components/LoadingNotice.tsx";
import { TagPanel } from "../components/TagPanel.tsx";
import { useLive, useMeta } from "../live.ts";
import { LocationPicker } from "../map/LocationPicker.tsx";
import { Link, navigate } from "../router.tsx";
import { showToast } from "../toast.tsx";
import { cityPath } from "../cityScope.ts";

type Draft = {
  name: string;
  badge: string;
  role: AgentRole;
  agencyId: string;
  rank: string;
  phone: string;
  shift: Shift;
  status: AgentStatus;
  baseName: string;
  baseNeighborhoodId: string;
  lat: string;
  lng: string;
  vehicleId: string;
};

const LABELS: Record<string, string> = {
  name: "Nome completo",
  badge: "Matrícula",
  role: "Função",
  agencyId: "Órgão",
  rank: "Graduação ou cargo",
  phone: "Telefone ou rádio",
  shift: "Turno",
  status: "Situação",
  baseName: "Base de atuação",
  baseNeighborhoodId: "Bairro da base",
  lat: "Latitude",
  lng: "Longitude",
  vehicleId: "Veículo",
};

const EMPTY: Draft = {
  name: "",
  badge: "",
  role: "traffic_agent",
  agencyId: "",
  rank: "",
  phone: "",
  shift: "morning",
  status: "off_duty",
  baseName: "",
  baseNeighborhoodId: "",
  lat: "",
  lng: "",
  vehicleId: "",
};

function fromAgent(agent: Agent): Draft {
  return {
    name: agent.name,
    badge: agent.badge,
    role: agent.role,
    agencyId: String(agent.agencyId),
    rank: agent.rank,
    phone: agent.phone,
    shift: agent.shift,
    status: agent.status,
    baseName: agent.baseName,
    baseNeighborhoodId: agent.baseNeighborhoodId,
    lat: String(agent.lat),
    lng: String(agent.lng),
    vehicleId: agent.vehicleId === null ? "" : String(agent.vehicleId),
  };
}

export function AgentFormPage({ id }: { id: number | null }) {
  const meta = useMeta();
  const { snapshot } = useLive();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [loaded, setLoaded] = useState(id === null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tag, setTag] = useState<Tag | null>(null);

  useEffect(() => {
    if (id === null) {
      return;
    }
    api
      .get<{ agent: Agent; tag: Tag | null }>(cityPath(`/agents/${id}`))
      .then((data) => {
        setDraft(fromAgent(data.agent));
        setTag(data.tag);
        setLoaded(true);
      })
      .catch((error: unknown) =>
        setLoadError(
          error instanceof ApiError ? error.message : "Não foi possível carregar o agente.",
        ),
      );
  }, [id]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    const payload = {
      ...draft,
      lat: draft.lat === "" ? null : Number(draft.lat),
      lng: draft.lng === "" ? null : Number(draft.lng),
      agencyId: draft.agencyId === "" ? null : Number(draft.agencyId),
      vehicleId: draft.vehicleId === "" ? null : Number(draft.vehicleId),
    };
    try {
      const saved =
        id === null
          ? await api.post<Agent>(cityPath("/agents"), payload)
          : await api.put<Agent>(cityPath(`/agents/${id}`), payload);
      showToast(
        id === null ? `${saved.name} cadastrado(a).` : `Cadastro de ${saved.name} atualizado.`,
      );
      navigate("/agents");
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
      await api.delete(cityPath(`/agents/${id}`));
      showToast(`${draft.name} removido(a) do cadastro.`);
      navigate("/agents");
    } catch (error) {
      setErrors({ form: error instanceof ApiError ? error.message : "Não foi possível excluir." });
    }
  };

  if (loadError) {
    return (
      <main className="page">
        <p className="error-box">{loadError}</p>
        <Link href="/agents">Voltar para a lista</Link>
      </main>
    );
  }
  if (!meta || !loaded) {
    return <LoadingNotice label="Carregando..." onRetry={() => window.location.reload()} />;
  }

  const vehicleType = draft.role === "traffic_agent" ? "agent_motorcycle" : "patrol_vehicle";
  const taken = new Set(
    snapshot?.agents
      .filter((agent) => agent.id !== id && agent.vehicleId !== null)
      .map((agent) => agent.vehicleId),
  );
  const vehicles = (snapshot?.equipment ?? []).filter(
    (item) =>
      item.type === vehicleType &&
      (vehicleType === "agent_motorcycle" || String(item.agencyId) === draft.agencyId) &&
      (!taken.has(item.id) || String(item.id) === draft.vehicleId),
  );
  const location =
    draft.lat && draft.lng ? { lat: Number(draft.lat), lng: Number(draft.lng) } : null;

  return (
    <main className="page">
      <div className="page-head">
        <h1>{id === null ? "Cadastrar agente" : `Editar ${draft.name}`}</h1>
        <Link href="/agents" className="button">
          Voltar para a lista
        </Link>
      </div>
      <form className="form" onSubmit={(event) => void submit(event)} noValidate>
        <ErrorSummary errors={errors} labels={LABELS} />
        <fieldset className="form-section">
          <legend>Identificação</legend>
          <div className="form-grid">
            <Field path="name" label={LABELS["name"]!} error={errors["name"]}>
              {(props) => (
                <input
                  {...props}
                  value={draft.name}
                  autoComplete="off"
                  onChange={(event) => set("name", event.target.value)}
                />
              )}
            </Field>
            <Field path="badge" label={LABELS["badge"]!} error={errors["badge"]}>
              {(props) => (
                <input
                  {...props}
                  value={draft.badge}
                  autoComplete="off"
                  onChange={(event) => set("badge", event.target.value)}
                />
              )}
            </Field>
            <Field path="rank" label={LABELS["rank"]!} error={errors["rank"]}>
              {(props) => (
                <input
                  {...props}
                  value={draft.rank}
                  onChange={(event) => set("rank", event.target.value)}
                />
              )}
            </Field>
            <Field path="agencyId" label={LABELS["agencyId"]!} error={errors["agencyId"]}>
              {(props) => (
                <select
                  {...props}
                  value={draft.agencyId}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      agencyId: event.target.value,
                      vehicleId: "",
                    }))
                  }
                >
                  <option value="">Selecione o órgão</option>
                  {meta.agencies.map((agency) => (
                    <option key={agency.id} value={agency.id}>
                      {agency.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field path="phone" label={LABELS["phone"]!} error={errors["phone"]}>
              {(props) => (
                <input
                  {...props}
                  type="tel"
                  value={draft.phone}
                  onChange={(event) => set("phone", event.target.value)}
                />
              )}
            </Field>
          </div>
          <OptionGroup
            name="role"
            label={LABELS["role"]!}
            error={errors["role"]}
            value={draft.role}
            compact
            onChange={(role: AgentRole) =>
              setDraft((current) => ({ ...current, role, vehicleId: "" }))
            }
            options={AGENT_ROLE_KEYS.map((key) => ({ value: key, label: AGENT_ROLES[key].label }))}
          />
        </fieldset>
        <fieldset className="form-section">
          <legend>Escala e situação</legend>
          <OptionGroup
            name="shift"
            label={LABELS["shift"]!}
            error={errors["shift"]}
            value={draft.shift}
            compact
            onChange={(shift: Shift) => set("shift", shift)}
            options={SHIFT_KEYS.map((key) => ({ value: key, label: SHIFTS[key] }))}
          />
          <OptionGroup
            name="status"
            label={LABELS["status"]!}
            error={errors["status"]}
            value={draft.status}
            compact
            onChange={(status: AgentStatus) => set("status", status)}
            options={AGENT_STATUSES.map((key) => ({
              value: key,
              label: AGENT_STATUS_LABELS[key],
              icon: <AgentShield status={key} size={16} />,
            }))}
          />
          <div className="form-grid form-grid-wide">
            <Field path="vehicleId" label={LABELS["vehicleId"]!} error={errors["vehicleId"]}>
              {(props) => (
                <select
                  {...props}
                  value={draft.vehicleId}
                  onChange={(event) => set("vehicleId", event.target.value)}
                >
                  <option value="">Sem veículo (a pé)</option>
                  {vehicles.map((item) => (
                    <option key={item.id} value={item.id}>
                      {EQUIPMENT_TYPES[item.type].label}{" "}
                      {String(item.attributes["plate"] ?? item.serialNumber)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        </fieldset>
        <fieldset className="form-section">
          <legend>Base e posição</legend>
          <div className="form-grid">
            <Field path="baseName" label={LABELS["baseName"]!} error={errors["baseName"]}>
              {(props) => (
                <input
                  {...props}
                  placeholder="Ex.: Base GCM Zona Norte"
                  value={draft.baseName}
                  onChange={(event) => set("baseName", event.target.value)}
                />
              )}
            </Field>
            <Field
              path="baseNeighborhoodId"
              label={LABELS["baseNeighborhoodId"]!}
              error={errors["baseNeighborhoodId"]}
            >
              {(props) => (
                <select
                  {...props}
                  value={draft.baseNeighborhoodId}
                  onChange={(event) => {
                    const neighborhood = meta.neighborhoods.find(
                      (item) => item.id === event.target.value,
                    );
                    setDraft((current) => ({
                      ...current,
                      baseNeighborhoodId: event.target.value,
                      lat: current.lat || (neighborhood ? neighborhood.lat.toFixed(6) : ""),
                      lng: current.lng || (neighborhood ? neighborhood.lng.toFixed(6) : ""),
                    }));
                  }}
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
            A posição é atualizada pelo rastreador quando o agente está em serviço. Use o mapa para
            definir a posição inicial.
          </p>
        </fieldset>
        <div className="form-actions">
          {id !== null && (
            <button
              type="button"
              className="button button-danger"
              onClick={() => setConfirmDelete(true)}
            >
              Excluir agente
            </button>
          )}
          <Link href="/agents" className="button">
            Cancelar
          </Link>
          <button type="submit" className="button button-primary" disabled={saving}>
            {saving ? "Salvando..." : id === null ? "Cadastrar agente" : "Salvar alterações"}
          </button>
        </div>
      </form>
      {id !== null && <TagPanel target={{ agentId: id }} initial={tag} moves />}
      <ConfirmDialog
        open={confirmDelete}
        title="Excluir este agente?"
        message={`O cadastro de ${draft.name} será removido. Atendimentos em andamento voltam para a fila de ocorrências.`}
        confirmLabel="Excluir agente"
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </main>
  );
}
