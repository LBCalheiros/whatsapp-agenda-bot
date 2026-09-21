'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/apiClient';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, senha }),
      });
      router.push('/painel');
      router.refresh();
    } catch (error) {
      const mensagem = error instanceof ApiError ? error.message : 'Erro inesperado';
      setErro(mensagem);
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-800"
      >
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Entrar</h1>

        <div className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
            Email
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-gray-400"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
            Senha
            <input
              type="password"
              required
              autoComplete="current-password"
              value={senha}
              onChange={(evento) => setSenha(evento.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-gray-400"
            />
          </label>

          {erro && <ErrorState mensagem={erro} />}

          <Button type="submit" disabled={enviando} className="mt-2 w-full">
            {enviando ? 'Entrando...' : 'Entrar'}
          </Button>
        </div>
      </form>
    </div>
  );
}
