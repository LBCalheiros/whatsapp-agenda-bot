export function LoadingState({ texto = 'Carregando...' }: { texto?: string }) {
  return <div className="flex items-center justify-center py-8 text-sm text-gray-500">{texto}</div>;
}
