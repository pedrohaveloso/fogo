import { useEffect, useRef, type ReactNode } from "react";

export function FilterMenu({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = (event: Event) => {
      const details = ref.current;
      if (!details?.open) {
        return;
      }
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") {
          details.open = false;
          details.querySelector("summary")?.focus();
        }
      } else if (!details.contains(event.target as Node)) {
        details.open = false;
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details ref={ref} className="filter-menu">
      <summary data-active={count > 0}>
        {label}
        {count > 0 && <span className="filter-menu-count">{count}</span>}
      </summary>
      <div className="filter-menu-body">{children}</div>
    </details>
  );
}
