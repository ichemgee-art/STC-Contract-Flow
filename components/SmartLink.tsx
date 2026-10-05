"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

export function SmartLink({
  href,
  onMouseEnter,
  onFocus,
  onTouchStart,
  prefetch,
  ...props
}: ComponentProps<typeof Link>) {
  const router = useRouter();
  const target = typeof href === "string" ? href : href.pathname || "";

  const warm = () => {
    if (target) router.prefetch(target);
  };

  return (
    <Link
      href={href}
      prefetch={prefetch ?? false}
      onMouseEnter={(event) => {
        warm();
        onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        warm();
        onFocus?.(event);
      }}
      onTouchStart={(event) => {
        warm();
        onTouchStart?.(event);
      }}
      {...props}
    />
  );
}
