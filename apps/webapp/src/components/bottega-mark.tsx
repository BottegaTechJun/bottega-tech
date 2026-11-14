interface Props {
  className?: string;
}

export function BottegaMark({ className }: Props) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="64" height="64" rx="14" fill="#2F5BFF" />
      <rect x="18" y="12" width="11" height="40" fill="#EDEFF2" />
      <path fill="#EDEFF2" d="M32 28A12 12 0 0 1 32 52Z" />
    </svg>
  );
}
