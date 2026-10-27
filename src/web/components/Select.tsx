import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { fold } from "../../shared/text.ts";
import { useAnchoredPopup } from "./popup.ts";

export type SelectOption = { value: string; label: string; icon?: ReactNode };

const SEARCH_THRESHOLD = 12;
const TYPEAHEAD_RESET_MS = 600;

export function moveActive(current: number, count: number, key: string): number | null {
  if (count === 0) {
    return null;
  }
  switch (key) {
    case "ArrowDown":
      return Math.min(current + 1, count - 1);
    case "ArrowUp":
      return Math.max(current - 1, 0);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export function matchTypeahead(
  labels: readonly string[],
  typed: string,
  from: number,
): number | null {
  const needle = typed.toLowerCase();
  for (let step = 1; step <= labels.length; step += 1) {
    const index = (from + step) % labels.length;
    if (labels[index]!.toLowerCase().startsWith(needle)) {
      return index;
    }
  }
  return null;
}

export function filterOptions(options: readonly SelectOption[], query: string): SelectOption[] {
  const needle = fold(query.trim());
  return needle === ""
    ? [...options]
    : options.filter((option) => fold(option.label).includes(needle));
}

type Props = {
  id?: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  size?: "md" | "sm";
  variant?: "field" | "filter";
  label?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string | undefined;
};

export function Select({
  id,
  value,
  options,
  onChange,
  placeholder = "Selecione",
  disabled = false,
  size = "md",
  variant = "field",
  label,
  "aria-invalid": invalid,
  "aria-describedby": describedBy,
}: Props) {
  const generated = useId();
  const listId = `${generated}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const typed = useRef({ text: "", at: 0 });
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const searchable = options.length > SEARCH_THRESHOLD;
  const visible = useMemo(() => filterOptions(options, query), [options, query]);
  const selected = options.find((option) => option.value === value);

  const popupStyle = useAnchoredPopup(open, button, popup, variant === "field");

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setQuery("");
    if (refocus) {
      button.current?.focus();
    }
  }, []);

  const openList = () => {
    const index = options.findIndex((option) => option.value === value);
    setActive(Math.max(index, 0));
    setOpen(true);
  };

  const choose = (option: SelectOption | undefined) => {
    if (option) {
      onChange(option.value);
    }
    close(true);
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    if (searchable) {
      search.current?.focus();
    }
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        close(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, searchable, close]);

  useEffect(() => {
    if (open) {
      popup.current
        ?.querySelector<HTMLElement>(`[id="${generated}-option-${active}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [open, active, generated]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }
    const next = moveActive(active, visible.length, event.key);
    if (next !== null) {
      event.preventDefault();
      setActive(next);
    } else if (event.key === "Enter" || (event.key === " " && !searchable)) {
      event.preventDefault();
      choose(visible[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Tab") {
      close(false);
    } else if (!searchable && event.key.length === 1) {
      const text =
        event.timeStamp - typed.current.at > TYPEAHEAD_RESET_MS
          ? event.key
          : typed.current.text + event.key;
      typed.current = { text, at: event.timeStamp };
      const match = matchTypeahead(
        visible.map((option) => option.label),
        text,
        text.length === 1 ? active : active - 1,
      );
      if (match !== null) {
        setActive(match);
      }
    }
  };

  const filterActive = variant === "filter" && value !== "";

  return (
    <div ref={root} className="select">
      <button
        ref={button}
        id={id}
        type="button"
        className="select-button"
        data-variant={variant}
        data-size={size}
        data-active={filterActive}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && !searchable ? `${generated}-option-${active}` : undefined}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onKeyDown}
      >
        {variant === "filter" ? (
          <>
            {label}
            {filterActive && <span className="filter-menu-count">1</span>}
          </>
        ) : (
          <span className="select-value" data-placeholder={!selected}>
            {selected?.icon}
            {selected?.label ?? placeholder}
          </span>
        )}
      </button>
      {open && (
        <div ref={popup} className="select-popup" style={popupStyle}>
          {searchable && (
            <input
              ref={search}
              type="search"
              className="select-search"
              aria-label="Buscar na lista"
              aria-controls={listId}
              aria-activedescendant={`${generated}-option-${active}`}
              placeholder="Buscar"
              value={query}
              onKeyDown={onKeyDown}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
            />
          )}
          <div id={listId} role="listbox" aria-label={label}>
            {visible.map((option, index) => (
              <button
                key={option.value}
                id={`${generated}-option-${index}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={option.value === value}
                data-active={index === active}
                onPointerMove={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                {option.icon}
                {option.label}
              </button>
            ))}
            {visible.length === 0 && <p className="select-empty">Nada encontrado</p>}
          </div>
        </div>
      )}
    </div>
  );
}
