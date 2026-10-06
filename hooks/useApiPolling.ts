'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/apiClient';

type Estado<T> =
  { status: 'carregando' } | { status: 'erro'; mensagem: string } | { status: 'sucesso'; dados: T };

export function useApiPolling<T>(caminho: string | null, intervaloMs: number): Estado<T> {
  const [estado, setEstado] = useState<Estado<T>>({
    status: 'carregando',
  });

  useEffect(() => {
    if (!caminho) return;

    const caminhoSeguro = caminho;
    let ativo = true;
    let controller: AbortController | null = null;

    async function buscar(primeiraVez: boolean) {
      if (primeiraVez) {
        setEstado({ status: 'carregando' });
      }

      controller = new AbortController();

      try {
        const dados = await apiFetch<T>(caminhoSeguro, {
          signal: controller.signal,
        });

        if (ativo) {
          setEstado({ status: 'sucesso', dados });
        }
      } catch (error) {
        if (!ativo) return;

        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        const mensagem = error instanceof ApiError ? error.message : 'Erro inesperado';

        setEstado({ status: 'erro', mensagem });
      }
    }

    buscar(true);

    const intervalId = setInterval(() => {
      buscar(false);
    }, intervaloMs);

    return () => {
      ativo = false;
      controller?.abort();
      clearInterval(intervalId);
    };
  }, [caminho, intervaloMs]);

  return estado;
}
