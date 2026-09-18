import { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'primario' | 'secundario';
};

export function Button({ variante = 'primario', className = '', ...props }: ButtonProps) {
  const estilos =
    variante === 'primario'
      ? 'bg-gray-900 text-white hover:bg-gray-800'
      : 'bg-white text-gray-900 border border-gray-300 hover:bg-gray-50';

  return (
    <button
      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${estilos} ${className}`}
      {...props}
    />
  );
}
