import { Breadcrumb } from "../components/Breadcrumb.tsx";
import { useEffect, useState, type FormEvent } from "react";
import type { User, UserRole } from "../../shared/types.ts";
import { api, ApiError } from "../api.ts";
import {
  ConfirmDialog,
  ErrorSummary,
  Field,
  FormActions,
  OptionGroup,
  issuesToErrors,
  removalError,
  type Errors,
} from "../components/form.tsx";
import { LoadingNotice } from "../components/LoadingNotice.tsx";
import { Link, navigate } from "../router.tsx";
import { useSession } from "../session.ts";
import { showToast } from "../toast.tsx";

type Draft = {
  username: string;
  name: string;
  role: UserRole;
  cityIds: number[];
  password: string;
};

const EMPTY: Draft = { username: "", name: "", role: "user", cityIds: [], password: "" };

const LABELS: Record<string, string> = {
  name: "Nome",
  username: "Usuário",
  password: "Senha",
  role: "Perfil",
  cityIds: "Cidades",
};

export function UserFormPage({ id }: { id: number | null }) {
  const { session } = useSession();
  const cities = session?.cities ?? [];
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [loaded, setLoaded] = useState(id === null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (id === null) {
      return;
    }
    api
      .get<User>(`/users/${id}`)
      .then((user) => {
        setDraft({ ...user, password: "" });
        setLoaded(true);
      })
      .catch((error: unknown) =>
        setLoadError(
          error instanceof ApiError ? error.message : "Não foi possível carregar o usuário.",
        ),
      );
  }, [id]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const toggleCity = (cityId: number, checked: boolean) =>
    setDraft((current) => ({
      ...current,
      cityIds: checked
        ? [...current.cityIds, cityId]
        : current.cityIds.filter((item) => item !== cityId),
    }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    const payload = { ...draft, password: draft.password === "" ? null : draft.password };
    try {
      const saved =
        id === null
          ? await api.post<User>("/users", payload)
          : await api.put<User>(`/users/${id}`, payload);
      showToast(id === null ? `${saved.name} cadastrado.` : `${saved.name} atualizado.`);
      navigate("/users");
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
      await api.delete(`/users/${id}`);
      showToast(`${draft.name} excluído.`);
      navigate("/users");
    } catch (error) {
      setErrors(removalError(error, "Não foi possível excluir."));
    }
  };

  if (loadError) {
    return (
      <main className="page">
        <p className="error-box">{loadError}</p>
        <Link href="/users">Voltar para a lista</Link>
      </main>
    );
  }
  if (!loaded) {
    return <LoadingNotice label="Carregando usuário..." />;
  }

  return (
    <main className="page">
      <Breadcrumb
        items={[
          { label: "Gerenciamento", href: "/management" },
          { label: "Usuários", href: "/users" },
        ]}
      />
      <div className="page-head">
        <h1>{id === null ? "Cadastrar usuário" : `Editar ${draft.name}`}</h1>
        <Link href="/users" className="button">
          Voltar para a lista
        </Link>
      </div>
      <form className="form" onSubmit={(event) => void submit(event)} noValidate>
        <ErrorSummary errors={errors} labels={LABELS} />
        <fieldset className="form-section">
          <legend>Acesso</legend>
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
            <Field path="username" label={LABELS["username"]!} error={errors["username"]}>
              {(props) => (
                <input
                  {...props}
                  value={draft.username}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  onChange={(event) => set("username", event.target.value)}
                />
              )}
            </Field>
            <Field
              path="password"
              label={id === null ? LABELS["password"]! : "Nova senha"}
              error={errors["password"]}
              hint={
                id === null
                  ? "Ao menos 8 caracteres."
                  : "Deixe em branco para manter a atual. Trocar a senha encerra as sessões abertas."
              }
            >
              {(props) => (
                <input
                  {...props}
                  type="password"
                  autoComplete="new-password"
                  value={draft.password}
                  onChange={(event) => set("password", event.target.value)}
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
            onChange={(role: UserRole) => set("role", role)}
            options={[
              { value: "user", label: "Usuário" },
              { value: "admin", label: "Administrador" },
            ]}
          />
        </fieldset>
        <fieldset className="form-section" disabled={draft.role === "admin"}>
          <legend>Cidades</legend>
          {draft.role === "admin" ? (
            <p className="hint">Administradores veem todas as cidades.</p>
          ) : cities.length === 0 ? (
            <p className="hint">Nenhuma cidade cadastrada ainda.</p>
          ) : (
            <div className="option-grid" data-compact="true" id="field-cityIds">
              {cities.map((city) => (
                <label key={city.id} className="option">
                  <input
                    type="checkbox"
                    checked={draft.cityIds.includes(city.id)}
                    onChange={(event) => toggleCity(city.id, event.target.checked)}
                  />
                  <span>
                    {city.name}/{city.uf}
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <FormActions>
          {id !== null && id !== session?.user?.id && (
            <button
              type="button"
              className="button button-danger"
              onClick={() => setConfirmDelete(true)}
            >
              Excluir usuário
            </button>
          )}
          <Link href="/users" className="button">
            Cancelar
          </Link>
          <button type="submit" className="button button-primary" disabled={saving}>
            {saving ? "Salvando..." : id === null ? "Cadastrar usuário" : "Salvar alterações"}
          </button>
        </FormActions>
      </form>
      <ConfirmDialog
        open={confirmDelete}
        title="Excluir este usuário?"
        message={`${draft.name} perde o acesso ao FOGO na hora. Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir usuário"
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </main>
  );
}
