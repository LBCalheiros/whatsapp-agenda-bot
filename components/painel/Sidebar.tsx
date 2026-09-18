'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITENS_NAV = [
  { href: '/painel', label: 'Dashboard' },
  { href: '/painel/agenda', label: 'Agenda' },
  { href: '/painel/funcionarios', label: 'Funcionários' },
  { href: '/painel/configuracoes', label: 'Configurações' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r border-gray-200 bg-white p-4">
      <div className="mb-6 px-2 text-sm font-semibold text-gray-900">Painel</div>
      <nav className="flex flex-col gap-1">
        {ITENS_NAV.map((item) => {
          const ativo = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
                ativo ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
