import Image from "next/image";
import Link from "next/link";
import { cn } from "@edge-lab/ui";

interface LogoProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  href?: string;
  showText?: boolean;
  className?: string;
}

const SIZE_MAP = {
  xs: 24,
  sm: 32,
  md: 48,
  lg: 80,
  xl: 140,
};

const TEXT_SIZE_MAP = {
  xs: "text-sm",
  sm: "text-base",
  md: "text-xl",
  lg: "text-3xl",
  xl: "text-5xl",
};

export function Logo({ size = "sm", href, showText = false, className }: LogoProps) {
  const px = SIZE_MAP[size];

  const inner = (
    <span className={cn("inline-flex items-center gap-2 select-none", className)}>
      <Image
        src="/logo.jpg"
        alt="Edge Lab"
        width={px}
        height={px}
        priority
        className="shrink-0"
      />
      {showText && (
        <span className={cn("font-black tracking-tight leading-none", TEXT_SIZE_MAP[size])}>
          <span className="text-white">EDGE</span>{" "}
          <span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            LAB
          </span>
        </span>
      )}
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex">
        {inner}
      </Link>
    );
  }

  return inner;
}

/** Inline SVG wordmark for places that can't load external images (e.g. Tauri, emails) */
export function LogoWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-black tracking-tight", className)}>
      <span className="text-white">EDGE</span>{" "}
      <span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
        LAB
      </span>
    </span>
  );
}
