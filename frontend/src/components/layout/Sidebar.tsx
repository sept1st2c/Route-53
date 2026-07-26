"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname();

  const menuItems = [
    { name: "Dashboard", href: "/dashboard" },
    { name: "Hosted Zones", href: "/hosted-zones" },
    { name: "Traffic Policies", href: "/traffic-policies" },
    { name: "Health Checks", href: "/health-checks" },
    { name: "Resolver", href: "/resolver" },
    { name: "Profiles", href: "/profiles" },
  ];

  return (
    <aside className="w-64 bg-[#111827]/40 border-r border-gray-800 p-4 space-y-2 min-h-[calc(100vh-68px)]">
      {menuItems.map((item) => {
        const isActive = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`block px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              isActive
                ? "bg-blue-600/15 text-blue-400 border border-blue-500/20"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
            }`}
          >
            {item.name}
          </Link>
        );
      })}
    </aside>
  );
}
