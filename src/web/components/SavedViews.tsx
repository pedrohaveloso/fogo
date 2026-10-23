import { useState, type FormEvent } from "react";
import {
  MAX_NAME_LENGTH,
  MAX_VIEWS,
  addView,
  loadViews,
  removeView,
  storeViews,
} from "../savedViews.ts";
import { FilterMenu } from "./FilterMenu.tsx";

export function SavedViews({
  currentQuery,
  onApply,
}: {
  currentQuery: string;
  onApply: (query: string) => void;
}) {
  const [views, setViews] = useState(loadViews);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");

  const update = (next: typeof views) => {
    setViews(next);
    storeViews(next);
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    const next = addView(views, name, currentQuery);
    if (next === null) {
      setMessage(
        name.trim() === ""
          ? "Digite um nome para a visão."
          : `Limite de ${MAX_VIEWS} visões. Remova uma para salvar outra.`,
      );
      return;
    }
    update(next);
    setMessage(`Visão "${name.trim()}" salva.`);
    setName("");
  };

  return (
    <FilterMenu label="Visões salvas" count={views.length}>
      <div className="saved-views">
        {views.length === 0 ? (
          <p className="hint">Nenhuma visão salva. Ajuste os filtros e salve a combinação.</p>
        ) : (
          <ul className="saved-list">
            {views.map((view) => (
              <li key={view.name}>
                <button
                  type="button"
                  className="saved-apply"
                  aria-current={view.query === currentQuery}
                  onClick={() => onApply(view.query)}
                >
                  {view.name}
                </button>
                <button
                  type="button"
                  className="button button-small button-ghost"
                  aria-label={`Remover a visão ${view.name}`}
                  onClick={() => update(removeView(views, view.name))}
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
        <form className="saved-form" onSubmit={save}>
          <label htmlFor="saved-view-name">Nome da visão</label>
          <input
            id="saved-view-name"
            type="text"
            maxLength={MAX_NAME_LENGTH}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" className="button button-small">
            Salvar filtros atuais
          </button>
        </form>
        <p className="hint" role="status">
          {message}
        </p>
      </div>
    </FilterMenu>
  );
}
