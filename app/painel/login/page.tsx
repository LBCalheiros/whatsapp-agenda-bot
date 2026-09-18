import { redirect } from 'next/navigation';
import { obterSessaoAtual } from '@/infra/autenticacaoMiddleware';
import { LoginForm } from './LoginForm';

export default async function PainelLoginPage() {
  const sessao = await obterSessaoAtual();

  if (sessao) {
    redirect('/painel');
  }

  return <LoginForm />;
}
