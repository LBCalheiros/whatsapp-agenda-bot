'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/apiClient';

type Estado<T> =
  { status: 'carregando' } | { status: 'erro'; mensagem: string } | { status: 'sucesso'; dados: T };

export function useApiPolling<T>(caminho: string | null, intervaloMs: number): Estado<T> {
  const [estado, setEstado] = useState<Estado<T>>({ status: 'carregando' });

  useEffect(() => {
    if (!caminho) return;

    let ativo = true;

    async function buscar(primeiraVez: boolean) {
      if (primeiraVez) {
        setEstado({ status: 'carregando' });
      }
      try {
        const dados = await apiFetch<T>(caminho as string);
        if (ativo) setEstado({ status: 'sucesso', dados });
      } catch (error) {
        if (!ativo) return;
        const mensagem = error instanceof ApiError ? error.message : 'Erro inesperado';
        setEstado({ status: 'erro', mensagem });
      }
    }

    buscar(true);
    const intervalId = setInterval(() => buscar(false), intervaloMs);

    return () => {
      ativo = false;
      clearInterval(intervalId);
    };
  }, [caminho, intervaloMs]);

  return estado;
}
