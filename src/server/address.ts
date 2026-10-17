import type { AddressLookup, CityDataset } from "../shared/types.ts";
import { findNeighborhoodByName, normalizeName } from "./city.ts";

const VIACEP_TIMEOUT_MS = 4000;

type ViaCepResponse = {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean | string;
};

export function normalizeCep(raw: string): string | null {
  const digits = raw.replaceAll(/\D/g, "");
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : null;
}

export async function lookupAddress(
  city: CityDataset,
  rawCep: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AddressLookup | null> {
  const cep = normalizeCep(rawCep);
  if (!cep) {
    return null;
  }
  const local = city.streets.find((street) => street.cep === cep);
  if (local) {
    const neighborhood = city.neighborhoods.find((item) => item.id === local.neighborhoodId);
    return {
      cep,
      street: local.name,
      neighborhoodId: local.neighborhoodId,
      neighborhoodName: neighborhood?.name ?? "",
      city: city.city.name,
      uf: city.city.uf,
      lat: local.lat,
      lng: local.lng,
      source: "local",
    };
  }

  let body: ViaCepResponse;
  try {
    const response = await fetchImpl(`https://viacep.com.br/ws/${cep.replace("-", "")}/json/`, {
      signal: AbortSignal.timeout(VIACEP_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    body = (await response.json()) as ViaCepResponse;
  } catch {
    return null;
  }
  if (body.erro || !body.cep) {
    return null;
  }

  const neighborhood = body.bairro ? findNeighborhoodByName(body.bairro) : null;
  const street = body.logradouro
    ? city.streets.find((item) => normalizeName(item.name) === normalizeName(body.logradouro ?? ""))
    : undefined;
  const anchor = street ?? neighborhood;
  return {
    cep,
    street: body.logradouro ?? "",
    neighborhoodId: neighborhood?.id ?? street?.neighborhoodId ?? null,
    neighborhoodName: body.bairro ?? "",
    city: body.localidade ?? "",
    uf: body.uf ?? "",
    lat: anchor?.lat ?? null,
    lng: anchor?.lng ?? null,
    source: "viacep",
  };
}
