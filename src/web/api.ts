export type ApiIssue = { path: string; message: string };

export class ApiError extends Error {
  readonly status: number;
  readonly issues: ApiIssue[];

  constructor(status: number, message: string, issues: ApiIssue[]) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? null : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Sem conexão com o servidor do F.O.G.O.", []);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string; issues?: ApiIssue[] })
    | null;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error ?? `Erro ${response.status}`,
      payload?.issues ?? [],
    );
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  delete: <T = void>(path: string) => request<T>("DELETE", path),
};
