import { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'primario' | 'secundario';
};

export function Button({ variante = 'primario', className = '', ...props }: ButtonProps) {
  const estilos =
    variante === 'primario'
      ? 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white'
      : 'bg-white text-gray-900 border border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-700';

  return (
    <button
      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${estilos} ${className}`}
      {...props}
    />
  );
}
