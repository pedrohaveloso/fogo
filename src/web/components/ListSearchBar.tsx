import { plural } from "../../shared/text.ts";

type Props = {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  shown: number;
  total: number;
  noun: [singular: string, plural: string];
};

export function ListSearchBar({
  id,
  label,
  placeholder,
  value,
  onChange,
  shown,
  total,
  noun,
}: Props) {
  return (
    <search className="filter-bar page-filter-bar" aria-label={label}>
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      <input
        id={id}
        type="search"
        className="filter-search"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="filter-result" role="status">
        {shown} de {total} {plural(total, ...noun)}
        {value !== "" && (
          <button
            type="button"
            className="button button-small button-ghost"
            onClick={() => onChange("")}
          >
            Limpar
          </button>
        )}
      </span>
    </search>
  );
}
