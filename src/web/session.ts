import { useSyncExternalStore } from "react";
import type { Session } from "../shared/types.ts";
import { api, setUnauthorizedHandler } from "./api.ts";
import { setCurrentCityId } from "./cityScope.ts";
import { resetCity } from "./live.ts";

type SessionState = { session: Session | null; error: string | null };

let state: SessionState = { session: null, error: null };
const listeners = new Set<() => void>();

function emit(next: SessionState): void {
  state = next;
  for (const listener of listeners) {
    listener();
  }
}

function apply(session: Session): void {
  const changed = state.session?.cityId !== session.cityId;
  setCurrentCityId(session.cityId);
  emit({ session, error: null });
  if (changed) {
    resetCity();
  }
}

export async function loadSession(): Promise<void> {
  try {
    apply(await api.get<Session>("/session"));
  } catch {
    emit({ session: state.session, error: "Não foi possível falar com o servidor do FOGO." });
  }
}

setUnauthorizedHandler(() => {
  void loadSession();
});

export async function login(username: string, password: string): Promise<void> {
  await api.post("/session", { username, password });
  await loadSession();
}

export async function logout(): Promise<void> {
  await api.delete("/session");
  await loadSession();
}

export async function chooseCity(cityId: number): Promise<void> {
  await api.put("/session/city", { cityId });
  await loadSession();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, () => state);
}
