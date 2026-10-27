import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

const MARGIN = 8;
const GAP = 4;
const MIN_HEIGHT = 120;

type Rect = { top: number; bottom: number; left: number };
type Size = { width: number; height: number };
type Bounds = { top: number; bottom: number; width: number };

export type Placement = { top: number; left: number; maxHeight: number };

export function placePopup(anchor: Rect, popup: Size, bounds: Bounds): Placement {
  const below = bounds.bottom - anchor.bottom - GAP - MARGIN;
  const above = anchor.top - bounds.top - GAP - MARGIN;
  const opensBelow = popup.height <= below || below >= above;
  const maxHeight = Math.max(MIN_HEIGHT, opensBelow ? below : above);
  const height = Math.min(popup.height, maxHeight);
  const left = Math.max(MARGIN, Math.min(anchor.left, bounds.width - MARGIN - popup.width));
  return {
    top: opensBelow ? anchor.bottom + GAP : anchor.top - GAP - height,
    left,
    maxHeight,
  };
}

const MAX_POPUP_HEIGHT = 360;

function cssPixels(name: string): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
}

function visibleBounds(anchor: DOMRect): Bounds {
  const header = cssPixels("--header-h");
  const bottomNav = cssPixels("--bottom-nav-h");
  return {
    top: anchor.top < header ? 0 : header,
    bottom: window.innerHeight - bottomNav,
    width: document.documentElement.clientWidth,
  };
}

export function useAnchoredPopup(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  popup: RefObject<HTMLElement | null>,
  matchAnchorWidth: boolean,
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const place = () => {
      const anchorElement = anchor.current;
      const popupElement = popup.current;
      if (!anchorElement || !popupElement) {
        return;
      }
      const rect = anchorElement.getBoundingClientRect();
      const borders = popupElement.offsetHeight - popupElement.clientHeight;
      const placement = placePopup(
        rect,
        {
          width: popupElement.offsetWidth,
          height: Math.min(popupElement.scrollHeight + borders, MAX_POPUP_HEIGHT),
        },
        visibleBounds(rect),
      );
      const next = {
        top: placement.top,
        left: placement.left,
        minWidth: matchAnchorWidth ? rect.width : undefined,
        "--popup-room": `${placement.maxHeight}px`,
      } as CSSProperties;
      setStyle((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
    };
    const onScroll = (event: Event) => {
      if (!(event.target instanceof Node) || !popup.current?.contains(event.target)) {
        place();
      }
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, anchor, popup, matchAnchorWidth]);

  return style;
}
