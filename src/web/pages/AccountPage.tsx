import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api.ts";
import { ErrorSummary, Field, issuesToErrors, type Errors } from "../components/form.tsx";
import { showToast } from "../toast.tsx";

const LABELS = { current: "Senha atual", next: "Nova senha", repeat: "Repita a nova senha" };

export function AccountPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (next !== repeat) {
      setErrors({ repeat: "As duas senhas novas não são iguais" });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      await api.put("/session/password", { current, next });
      setCurrent("");
      setNext("");
      setRepeat("");
      showToast("Senha trocada. As outras sessões abertas foram encerradas.");
    } catch (error) {
      setErrors(
        error instanceof ApiError && error.issues.length > 0
          ? issuesToErrors(error.issues)
          : {
              form: error instanceof ApiError ? error.message : "Não foi possível trocar a senha.",
            },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <div className="page-head">
        <h1>Minha senha</h1>
      </div>
      <form className="form" onSubmit={(event) => void submit(event)} noValidate>
        <ErrorSummary errors={errors} labels={LABELS} />
        <fieldset className="form-section">
          <legend>Trocar senha</legend>
          <div className="form-grid">
            <Field path="current" label={LABELS.current} error={errors["current"]}>
              {(props) => (
                <input
                  {...props}
                  type="password"
                  autoComplete="current-password"
                  value={current}
                  onChange={(event) => setCurrent(event.target.value)}
                />
              )}
            </Field>
            <Field
              path="next"
              label={LABELS.next}
              error={errors["next"]}
              hint="Ao menos 8 caracteres."
            >
              {(props) => (
                <input
                  {...props}
                  type="password"
                  autoComplete="new-password"
                  value={next}
                  onChange={(event) => setNext(event.target.value)}
                />
              )}
            </Field>
            <Field path="repeat" label={LABELS.repeat} error={errors["repeat"]}>
              {(props) => (
                <input
                  {...props}
                  type="password"
                  autoComplete="new-password"
                  value={repeat}
                  onChange={(event) => setRepeat(event.target.value)}
                />
              )}
            </Field>
          </div>
        </fieldset>
        <div className="form-actions">
          <button type="submit" className="button button-primary" disabled={busy}>
            {busy ? "Salvando..." : "Trocar senha"}
          </button>
        </div>
      </form>
    </main>
  );
}
