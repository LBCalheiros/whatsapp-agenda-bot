import { redirect } from 'next/navigation';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { Sidebar } from '@/components/painel/Sidebar';

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const sessao = await obterSessaoAtual();

  if (!sessao) {
    redirect('/painel/login');
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 md:flex-row dark:bg-gray-950">
      <Sidebar />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
