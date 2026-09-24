'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiClient';
import { ThemeToggle } from './ThemeToggle';

const ITENS_NAV = [
  { href: '/painel', label: 'Dashboard' },
  { href: '/painel/atendimentos', label: 'Atendimentos' },
  { href: '/painel/agenda', label: 'Agenda' },
  { href: '/painel/disponibilidade', label: 'Disponibilidade' },
  { href: '/painel/funcionarios', label: 'Funcionários' },
  { href: '/painel/configuracoes', label: 'Configurações' },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);

  async function handleLogout() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    router.push('/painel/login');
    router.refresh();
  }

  function fecharDrawer() {
    setAberto(false);
  }

  return (
    <>
      {/* Barra superior só no mobile, com o botão de menu */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white p-4 md:hidden dark:border-gray-800 dark:bg-gray-900">
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Painel</span>
        <button
          onClick={() => setAberto(true)}
          aria-label="Abrir menu"
          className="rounded p-2 text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M2.5 5h15M2.5 10h15M2.5 15h15"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Fundo escurecido atrás do drawer, só quando aberto no mobile */}
      {aberto && (
        <div
          onClick={() => setAberto(false)}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white p-4 transition-transform duration-200 dark:border-gray-800 dark:bg-gray-900 md:static md:translate-x-0 ${
          aberto ? 'translate-x-0' : '-translate-x-full'
        } md:flex`}
      >
        <div className="mb-6 flex items-center justify-between px-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Painel</span>
          <button
            onClick={() => setAberto(false)}
            aria-label="Fechar menu"
            className="rounded p-1 text-gray-500 hover:bg-gray-100 md:hidden dark:text-gray-400 dark:hover:bg-gray-800"
          >
            ✕
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {ITENS_NAV.map((item) => {
            const ativo = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={fecharDrawer}
                className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
                  ativo
                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <ThemeToggle />

        <button
          onClick={handleLogout}
          className="rounded px-3 py-2 text-left text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
        >
          Sair
        </button>
      </aside>
    </>
  );
}
