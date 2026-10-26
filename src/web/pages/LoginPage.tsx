import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../api.ts";
import { Field, issuesToErrors, type Errors } from "../components/form.tsx";
import { BrandMark } from "../icons.tsx";
import { login, useSession } from "../session.ts";

export function LoginPage() {
  const simulation = useSession().session?.mode === "simulation";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = "Entrar: FOGO";
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await login(username, password);
    } catch (error) {
      setErrors(
        error instanceof ApiError && error.issues.length > 0
          ? issuesToErrors(error.issues)
          : { form: error instanceof ApiError ? error.message : "Não foi possível entrar." },
      );
      setBusy(false);
    }
  };

  return (
    <main className="login" id="content">
      <form className="login-card panel" onSubmit={(event) => void submit(event)} noValidate>
        <div className="login-brand">
          <BrandMark />
          <h1>FOGO</h1>
        </div>
        {errors["form"] && (
          <p className="error-box" role="alert">
            {errors["form"]}
          </p>
        )}
        <Field path="username" label="Usuário" error={errors["username"]}>
          {(props) => (
            <input
              {...props}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          )}
        </Field>
        <Field path="password" label="Senha" error={errors["password"]}>
          {(props) => (
            <input
              {...props}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>
        <button type="submit" className="button button-primary" disabled={busy}>
          {busy ? "Entrando..." : "Entrar"}
        </button>
        {simulation && (
          <p className="login-hint">
            Modo simulação: entre com <strong>root</strong> / <strong>root</strong>
          </p>
        )}
      </form>
    </main>
  );
}
