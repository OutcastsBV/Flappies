export default function HappyHourBadge({ active }: { active?: boolean }) {
  if (!active) return null;

  return (
    <span className="inline-block text-xs font-medium bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
      Happy hour
    </span>
  );
}
