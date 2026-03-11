"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "鑑定", key: "analyze" },
  { href: "/want", label: "想試", key: "want" },
  { href: "/catalog", label: "圖鑑", key: "tried" },
];

export default function AppNav() {
  const pathname = usePathname();
  if (pathname === "/settings") return null;

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[calc(env(safe-area-inset-bottom)+0.45rem)]">
      <div className="pointer-events-auto w-[min(92vw,20rem)] rounded-2xl border border-gray-200 bg-white/95 p-1.5 shadow-sm backdrop-blur">
        <div className="flex w-full items-center gap-1 rounded-full bg-gray-100 p-1">
          {navItems.map((item) => {
            const isActive =
              item.key === "analyze"
                ? pathname === "/"
                : item.key === "want"
                  ? pathname === "/want"
                  : pathname === "/catalog";
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`flex min-h-10 flex-1 items-center justify-center rounded-full px-4 py-2 text-sm transition ${
                  isActive
                    ? "bg-black text-white"
                    : "text-gray-500 hover:bg-white hover:text-gray-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
