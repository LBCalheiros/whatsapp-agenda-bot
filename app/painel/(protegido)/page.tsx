'use client';

import { useApi } from '@/hooks/useApi';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Card } from '@/components/ui/Card';

type Usuario = { email: string; role: string };

export default function PainelDashboardPage() {
  const estado = useApi<Usuario>('/api/auth/me');

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
      <p className="mt-1 text-sm text-gray-500">
        Isso é um teste da página após o login. Dashboard ainda vai ser configurada.
      </p>

      <Card className="mt-6 max-w-sm">
        {estado.status === 'carregando' && <LoadingState texto="Carregando sessão..." />}
        {estado.status === 'erro' && <ErrorState mensagem={estado.mensagem} />}
        {estado.status === 'sucesso' && (
          <p className="text-sm text-gray-700">
            Logado como <strong>{estado.dados.email}</strong> ({estado.dados.role})
          </p>
        )}
      </Card>
    </div>
  );
}
