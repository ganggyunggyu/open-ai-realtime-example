export default function Button({ icon, children, onClick, className, disabled }) {
  return (
    <button
      className={`bg-gray-800 dark:bg-gray-700 text-white rounded-full p-4 flex items-center gap-1 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {children}
    </button>
  );
}
