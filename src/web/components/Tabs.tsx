import { useRef, type KeyboardEvent, type ReactNode } from "react";

export function nextTabIndex(current: number, count: number, key: string): number | null {
  switch (key) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export function tabId(idPrefix: string, key: string): string {
  return `${idPrefix}-tab-${key}`;
}

export function tabPanelId(idPrefix: string): string {
  return `${idPrefix}-panel`;
}

type Props<K extends string> = {
  items: readonly { key: K; label: ReactNode }[];
  selected: K;
  onSelect: (key: K) => void;
  label: string;
  idPrefix: string;
  className: string;
};

export function TabList<K extends string>({
  items,
  selected,
  onSelect,
  label,
  idPrefix,
  className,
}: Props<K>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextTabIndex(index, items.length, event.key);
    if (next === null) {
      return;
    }
    event.preventDefault();
    onSelect(items[next]!.key);
    buttons.current[next]?.focus();
  };
  return (
    <div className={className} role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.key}
          ref={(element) => {
            buttons.current[index] = element;
          }}
          type="button"
          role="tab"
          id={tabId(idPrefix, item.key)}
          aria-selected={selected === item.key}
          aria-controls={tabPanelId(idPrefix)}
          tabIndex={selected === item.key ? 0 : -1}
          onClick={() => onSelect(item.key)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
