export default function BrandLogo({
  size = 40,
  className = '',
  alt = 'Flappies',
}: {
  size?: number;
  className?: string;
  alt?: string;
}) {
  return (
    // Static brand mark; next/image is unnecessary for this tiny local PNG.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/flappies-logo.png"
      alt={alt}
      width={size}
      height={size}
      className={`rounded-xl ${className}`.trim()}
    />
  );
}
