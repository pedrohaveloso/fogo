export const USER_AGENT = "fogo-dataset/1.0";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const RETRY_STATUSES = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 6;

export type OsmElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  nodes?: number[];
  tags?: Record<string, string>;
};

export async function overpass(query: string, attempt = 1): Promise<OsmElement[]> {
  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    body: new URLSearchParams({ data: `[out:json][timeout:150];${query}` }),
  });
  if (RETRY_STATUSES.has(response.status) && attempt < MAX_ATTEMPTS) {
    await new Promise((resolve) => setTimeout(resolve, 5000 * 2 ** (attempt - 1)));
    return overpass(query, attempt + 1);
  }
  if (!response.ok) {
    throw new Error(`Overpass respondeu ${response.status}`);
  }
  const body = (await response.json()) as { elements: OsmElement[] };
  return body.elements;
}
