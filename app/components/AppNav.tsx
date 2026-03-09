"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "鑑定" },
  { href: "/catalog", label: "圖鑑" },
];

export default function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="pointer-events-none fixed inset-x-0 z-30 flex justify-center pt-[calc(env(safe-area-inset-top)+0.75rem)]">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-gray-200 bg-white/95 p-1.5 shadow-sm backdrop-blur">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-11 items-center rounded-full px-4 py-2 text-sm transition ${
                isActive
                  ? "bg-black text-white"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
