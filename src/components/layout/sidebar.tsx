"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/layout/theme-provider";
import {
  LayoutDashboard, PlayCircle, Activity, Swords,
  PieChart, Users, Trophy,
  ChevronLeft, ChevronRight, Menu, X, Sun, Moon,
} from "lucide-react";

const navItems = [
  { href: "/",            label: "Dashboard",    icon: LayoutDashboard },
  { href: "/race",        label: "Race Replay",  icon: PlayCircle },
  { href: "/h2h",         label: "Head to Head", icon: Swords },
  { href: "/telemetry",  label: "Telemetry",    icon: Activity },
  { href: "/strategy",   label: "Strategy",     icon: PieChart },
  { href: "/drivers",    label: "Drivers",      icon: Users },
  { href: "/constructors", label: "Constructors", icon: Trophy },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggle } = useTheme();

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-lg cursor-pointer border border-racing-red/30 bg-[var(--f1-card)]"
        aria-label="Toggle navigation"
      >
        {mobileOpen ? <X className="w-5 h-5 text-f1-sub" /> : <Menu className="w-5 h-5 text-f1-sub" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/70 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — always dark (like F1.com nav) */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full z-40 flex flex-col transition-all duration-300",
          "border-r border-white/[0.06]",
          collapsed ? "w-[68px]" : "w-[220px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
        style={{
          background: "#15151e",
          backgroundImage: "repeating-linear-gradient(-55deg, transparent, transparent 8px, rgba(255,255,255,0.018) 8px, rgba(255,255,255,0.018) 16px)",
        }}
      >
        {/* F1 Red top accent line */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-racing-red" />

        {/* Logo */}
        <div className={cn(
          "flex items-center gap-3 px-4 pt-7 pb-5 border-b border-white/[0.06]",
          collapsed && "justify-center px-0 pt-7"
        )}>
          {/* F1-style logo mark */}
          <div
            className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded font-black text-white text-xs tracking-wider"
            style={{ background: '#e10600', fontFamily: 'Titillium Web, sans-serif', fontSize: '11px', letterSpacing: '0.05em' }}
          >
            F1
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span
                className="font-black text-white text-sm uppercase tracking-widest leading-tight truncate"
                style={{ fontFamily: 'Titillium Web, sans-serif', letterSpacing: '0.15em' }}
              >
                Pulse
              </span>
              <span className="text-[9px] text-white/25 uppercase tracking-[0.2em] mt-0.5">
                Race Analytics
              </span>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 cursor-pointer group",
                  collapsed && "justify-center px-0",
                  isActive
                    ? "bg-white/[0.07] text-white"
                    : "text-white/40 hover:text-white/75 hover:bg-white/[0.04]"
                )}
              >
                {/* Active left bar */}
                {isActive && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                    style={{ background: '#e10600' }}
                  />
                )}

                <item.icon className={cn(
                  "w-[18px] h-[18px] flex-shrink-0 transition-colors",
                  isActive ? "text-racing-red" : "text-white/35 group-hover:text-white/60"
                )} />

                {!collapsed && (
                  <span
                    className={cn(
                      "text-[13px] font-semibold truncate",
                      isActive ? "text-white" : ""
                    )}
                    style={{ fontFamily: 'Titillium Web, sans-serif', letterSpacing: '0.02em' }}
                  >
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom: theme toggle + live badge + collapse */}
        <div className="border-t border-white/[0.06]">

          {/* Theme toggle button */}
          <div className={cn("px-2 pt-2", collapsed && "flex justify-center")}>
            <button
              onClick={toggle}
              className={cn(
                "flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg transition-all duration-200 cursor-pointer group",
                "text-white/40 hover:text-white/75 hover:bg-white/[0.04]",
                collapsed && "justify-center px-0 w-10 mx-auto"
              )}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? (
                <Sun className="w-[18px] h-[18px] flex-shrink-0 text-white/35 group-hover:text-racing-amber transition-colors" />
              ) : (
                <Moon className="w-[18px] h-[18px] flex-shrink-0 text-white/35 group-hover:text-white/60 transition-colors" />
              )}
              {!collapsed && (
                <span
                  className="text-[13px] font-semibold"
                  style={{ fontFamily: 'Titillium Web, sans-serif', letterSpacing: '0.02em' }}
                >
                  {theme === "dark" ? "Light Mode" : "Dark Mode"}
                </span>
              )}
            </button>
          </div>

          {/* Live badge */}
          {!collapsed && (
            <div className="px-4 py-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-racing-red animate-pulse flex-shrink-0" />
              <span className="text-[9px] text-white/25 uppercase tracking-[0.18em] font-bold" style={{ fontFamily: 'Titillium Web, sans-serif' }}>
                Live Data
              </span>
            </div>
          )}

          {/* Collapse toggle (desktop) */}
          <div className="hidden lg:flex p-2">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className={cn(
                "flex items-center justify-center w-full py-2 rounded-lg text-white/25 hover:text-white/50 hover:bg-white/[0.04] transition-all cursor-pointer",
                collapsed && "mx-auto w-10"
              )}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed
                ? <ChevronRight className="w-3.5 h-3.5" />
                : <ChevronLeft className="w-3.5 h-3.5" />
              }
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
