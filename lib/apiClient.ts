export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'include',
  });

  const dados = await response.json().catch(() => null);

  if (!response.ok) {
    const mensagem = dados?.erro ?? 'Erro inesperado';
    throw new ApiError(mensagem, response.status);
  }

  return dados as T;
}
