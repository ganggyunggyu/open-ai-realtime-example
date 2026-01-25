export default function Button({
  icon,
  children,
  onClick,
  className = '',
  disabled,
  variant = 'primary',
  size = 'md',
}) {
  const baseStyles = `
    inline-flex items-center justify-center gap-2
    font-medium rounded-2xl
    transition-all duration-200 transform
    focus:outline-none focus:ring-2 focus:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
  `;

  const variants = {
    primary: `
      gradient-primary text-white
      shadow-md hover:shadow-lg
      hover:scale-[1.02] active:scale-[0.98]
      focus:ring-[var(--color-primary)]
    `,
    secondary: `
      bg-[var(--color-gray-100)] dark:bg-[var(--color-gray-800)]
      text-[var(--color-gray-700)] dark:text-[var(--color-gray-200)]
      hover:bg-[var(--color-gray-200)] dark:hover:bg-[var(--color-gray-700)]
      hover:scale-[1.02] active:scale-[0.98]
      focus:ring-[var(--color-gray-400)]
    `,
    ghost: `
      bg-transparent
      text-[var(--color-gray-600)] dark:text-[var(--color-gray-400)]
      hover:bg-[var(--color-gray-100)] dark:hover:bg-[var(--color-gray-800)]
      hover:text-[var(--color-gray-900)] dark:hover:text-white
      focus:ring-[var(--color-gray-400)]
    `,
    danger: `
      bg-[var(--color-error)] text-white
      shadow-md hover:shadow-lg
      hover:scale-[1.02] active:scale-[0.98]
      focus:ring-[var(--color-error)]
    `,
  };

  const sizes = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-5 py-3 text-base',
    lg: 'px-7 py-4 text-lg',
    icon: 'p-3',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {children}
    </button>
  );
}
