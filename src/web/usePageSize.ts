import { useState } from "react";
import { parsePageSize, type PageSize } from "./pagination.ts";

function storageKey(list: string): string {
  return `fogo:page-size:${list}`;
}

function load(list: string): PageSize {
  try {
    return parsePageSize(localStorage.getItem(storageKey(list)));
  } catch {
    return parsePageSize(null);
  }
}

export function usePageSize(list: string): [PageSize, (size: PageSize) => void] {
  const [size, setSize] = useState(() => load(list));
  const update = (next: PageSize) => {
    setSize(next);
    try {
      localStorage.setItem(storageKey(list), String(next));
    } catch {
      return;
    }
  };
  return [size, update];
}
