export function ErrorState({ mensagem }: { mensagem: string }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
      {mensagem}
    </div>
  );
}
