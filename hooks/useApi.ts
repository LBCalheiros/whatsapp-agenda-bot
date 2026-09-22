'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/apiClient';

type Estado<T> =
  { status: 'carregando' } | { status: 'erro'; mensagem: string } | { status: 'sucesso'; dados: T };

export function useApi<T>(caminho: string): Estado<T> {
  const [estado, setEstado] = useState<Estado<T>>({ status: 'carregando' });

  useEffect(() => {
    let ativo = true;

    apiFetch<T>(caminho)
      .then((dados) => {
        if (ativo) setEstado({ status: 'sucesso', dados });
      })
      .catch((error: unknown) => {
        if (!ativo) return;
        const mensagem = error instanceof ApiError ? error.message : 'Erro inesperado';
        setEstado({ status: 'erro', mensagem });
      });

    return () => {
      ativo = false;
    };
  }, [caminho]);

  return estado;
}
