'use client';

import { useEffect, useState } from 'react';

const CHAVE_TEMA = 'tema';

function aplicarTema(escuro: boolean) {
  document.documentElement.classList.toggle('dark', escuro);
  localStorage.setItem(CHAVE_TEMA, escuro ? 'escuro' : 'claro');
}

export function ThemeToggle() {
  const [escuro, setEscuro] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza o estado do React com a classe já aplicada no <html> pelo script anti-flash, só na montagem
    setEscuro(document.documentElement.classList.contains('dark'));
  }, []);

  function alternar() {
    const novoValor = !escuro;
    setEscuro(novoValor);
    aplicarTema(novoValor);
  }

  return (
    <button
      onClick={alternar}
      className="rounded px-3 py-2 text-left text-sm font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
    >
      {escuro ? '☀️ Modo claro' : '🌙 Modo escuro'}
    </button>
  );
}
