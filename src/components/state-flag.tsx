import { stateName } from "@/lib/us-states";

/** A league's home-state flag — see League.homeState in schema.prisma. Renders nothing for leagues created before that field existed. */
export function StateFlag({ code, size = 20, className }: { code: string | null | undefined; size?: number; className?: string }) {
  if (!code) return null;
  const name = stateName(code);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static /public asset, no next/image optimization needed for a 50-file icon set
    <img
      src={`/flags/${code}.svg`}
      alt={name ? `${name} flag` : code}
      title={name ?? code}
      width={size}
      height={size * 0.667}
      className={`inline-block rounded-sm object-cover shadow-sm ${className ?? ""}`}
      style={{ width: size, height: size * 0.667 }}
    />
  );
}
