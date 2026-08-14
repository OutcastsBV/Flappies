'use client';

type TopUpButtonProps = {
  enabled: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
};

const DISABLED_TOOLTIP = 'Top-up is temporarily disabled';

export default function TopUpButton({
  enabled,
  onClick,
  className = '',
  children,
}: TopUpButtonProps) {
  if (!enabled) {
    return (
      <button
        type="button"
        disabled
        title={DISABLED_TOOLTIP}
        className={`${className} opacity-50 cursor-not-allowed`}
      >
        {children}
      </button>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}
