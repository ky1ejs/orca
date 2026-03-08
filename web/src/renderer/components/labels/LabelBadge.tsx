interface LabelBadgeProps {
  name: string;
  color: string;
  onRemove?: () => void;
}

export function LabelBadge({ name, color, onRemove }: LabelBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        backgroundColor: `${color}20`,
        color: color,
        border: `1px solid ${color}40`,
      }}
      data-testid="label-badge"
    >
      {name}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hover:opacity-80 ml-0.5"
          data-testid="label-remove"
          aria-label={`Remove ${name}`}
        >
          &times;
        </button>
      )}
    </span>
  );
}
