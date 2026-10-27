import { Breadcrumb } from "../components/Breadcrumb.tsx";
import { useState, type FormEvent } from "react";
import type { Agency } from "../../shared/types.ts";
import { api, ApiError } from "../api.ts";
import { cityPath } from "../cityScope.ts";
import {
  ConfirmDialog,
  ErrorSummary,
  Field,
  FormActions,
  issuesToErrors,
  removalError,
  type Errors,
} from "../components/form.tsx";
import { LoadingNotice } from "../components/LoadingNotice.tsx";
import { reloadMeta, useMeta } from "../live.ts";
import { Link, navigate } from "../router.tsx";
import { showToast } from "../toast.tsx";

const LABELS: Record<string, string> = { name: "Nome" };

export function AgencyFormPage({ id }: { id: number | null }) {
  const meta = useMeta();
  const current = id === null ? null : (meta?.agencies.find((item) => item.id === id) ?? null);
  const [name, setName] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!meta) {
    return <LoadingNotice label="Carregando órgão..." />;
  }
  if (id !== null && !current) {
    return (
      <main className="page">
        <p className="error-box">Órgão não encontrado.</p>
        <Link href="/agencies">Voltar para a lista</Link>
      </main>
    );
  }

  const value = name ?? current?.name ?? "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const saved =
        id === null
          ? await api.post<Agency>(cityPath("/agencies"), { name: value })
          : await api.put<Agency>(cityPath(`/agencies/${id}`), { name: value });
      reloadMeta();
      showToast(id === null ? `${saved.name} cadastrado.` : `${saved.name} atualizado.`);
      navigate("/agencies");
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
      await api.delete(cityPath(`/agencies/${id}`));
      reloadMeta();
      showToast(`${current?.name ?? "O órgão"} excluído.`);
      navigate("/agencies");
    } catch (error) {
      setErrors(removalError(error, "Não foi possível excluir."));
    }
  };

  return (
    <main className="page">
      <Breadcrumb
        items={[
          { label: "Gerenciamento", href: "/management" },
          { label: "Órgãos", href: "/agencies" },
        ]}
      />
      <div className="page-head">
        <h1>{id === null ? "Cadastrar órgão" : `Editar ${current?.name ?? ""}`}</h1>
        <Link href="/agencies" className="button">
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
                  value={value}
                  maxLength={80}
                  autoComplete="off"
                  placeholder="Ex.: Secretaria de Trânsito"
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>
          </div>
        </fieldset>
        <FormActions>
          {id !== null && (
            <button
              type="button"
              className="button button-danger"
              onClick={() => setConfirmDelete(true)}
            >
              Excluir órgão
            </button>
          )}
          <Link href="/agencies" className="button">
            Cancelar
          </Link>
          <button type="submit" className="button button-primary" disabled={saving}>
            {saving ? "Salvando..." : id === null ? "Cadastrar órgão" : "Salvar alterações"}
          </button>
        </FormActions>
      </form>
      <ConfirmDialog
        open={confirmDelete}
        title="Excluir este órgão?"
        message={`${current?.name ?? "O órgão"} sai da lista. Só dá para excluir um órgão sem equipamentos nem agentes.`}
        confirmLabel="Excluir órgão"
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </main>
  );
}
