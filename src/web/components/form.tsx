import { useEffect, useRef, type ReactNode } from "react";
import type { ApiIssue } from "../api.ts";

export type Errors = Record<string, string>;

export function issuesToErrors(issues: ApiIssue[]): Errors {
  const errors: Errors = {};
  for (const issue of issues) {
    errors[issue.path || "form"] ??= issue.message;
  }
  return errors;
}

export function fieldId(path: string): string {
  return `field-${path.replaceAll(".", "-")}`;
}

type FieldProps = {
  path: string;
  label: string;
  error: string | undefined;
  hint?: string;
  children: (props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
  }) => ReactNode;
};

export function Field({ path, label, error, hint, children }: FieldProps) {
  const id = fieldId(path);
  const describedBy =
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className="field" data-invalid={Boolean(error)}>
      <label htmlFor={id}>{label}</label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {hint && (
        <span id={`${id}-hint`} className="hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}

export function ErrorSummary({
  errors,
  labels,
}: {
  errors: Errors;
  labels: Record<string, string>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const entries = Object.entries(errors);
  useEffect(() => {
    if (entries.length > 0) {
      ref.current?.focus();
    }
  }, [entries.length]);
  if (entries.length === 0) {
    return null;
  }
  return (
    <div ref={ref} className="error-box" role="alert" tabIndex={-1}>
      <strong>
        Revise {entries.length === 1 ? "o campo abaixo" : `os ${entries.length} campos abaixo`}{" "}
        antes de salvar:
      </strong>
      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
        {entries.map(([path, message]) => (
          <li key={path}>
            {path === "form" ? (
              message
            ) : (
              <a href={`#${fieldId(path)}`}>
                {labels[path] ?? path}: {message}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);
  return (
    <dialog ref={ref} onClose={onCancel} aria-labelledby="confirm-title">
      <h2 id="confirm-title" style={{ fontSize: "1.3rem", marginBottom: 8 }}>
        {title}
      </h2>
      <p style={{ color: "var(--ink-2)" }}>{message}</p>
      <div className="form-actions" style={{ marginTop: 18 }}>
        <button type="button" className="button" onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="button button-danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
