"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Activity,
  Timer,
  Trophy,
  Zap,
  BarChart3,
  Radio,
  Flag,
} from "lucide-react";

// ─── Animated counter ────────────────────────────────────────────────
function AnimatedNumber({ target, duration = 2000 }: { target: number; duration?: number }) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setValue(target);
        clearInterval(timer);
      } else {
        setValue(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);

  return <span ref={ref} style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>;
}

// ─── Simulated race position data for the hero chart ─────────────────
const DRIVERS = [
  { code: "VER", color: "#3671C6", positions: [1, 1, 1, 2, 2, 1, 1, 1, 1, 1] },
  { code: "NOR", color: "#FF8000", positions: [3, 2, 2, 1, 1, 2, 2, 2, 3, 2] },
  { code: "LEC", color: "#E8002D", positions: [2, 3, 3, 3, 3, 3, 3, 3, 2, 3] },
  { code: "HAM", color: "#27F4D2", positions: [5, 5, 4, 4, 4, 4, 5, 4, 4, 4] },
  { code: "PIA", color: "#FF8000", positions: [4, 4, 5, 5, 5, 5, 4, 5, 5, 5] },
];

function RaceChart() {
  const [activeLap, setActiveLap] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveLap((prev) => (prev + 1) % 10);
    }, 1200);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative w-full h-48 sm:h-64">
      {/* Lap markers */}
      <div className="absolute inset-0 flex">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 border-r border-white/[0.04] relative"
          >
            {i === activeLap && (
              <div className="absolute inset-0 bg-racing-red/[0.04] transition-opacity duration-300" />
            )}
          </div>
        ))}
      </div>

      {/* Position lines */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 900 240" preserveAspectRatio="none">
        {DRIVERS.map((driver) => {
          const points = driver.positions
            .map((pos, i) => {
              const x = (i / 9) * 880 + 10;
              const y = ((pos - 1) / 4) * 200 + 20;
              return `${x},${y}`;
            })
            .join(" ");

          return (
            <g key={driver.code}>
              <polyline
                points={points}
                fill="none"
                stroke={driver.color}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={0.85}
              />
              {/* Active lap dot */}
              <circle
                cx={(activeLap / 9) * 880 + 10}
                cy={((driver.positions[activeLap] - 1) / 4) * 200 + 20}
                r="5"
                fill={driver.color}
                className="transition-all duration-300"
              >
                <animate
                  attributeName="r"
                  values="4;6;4"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
              </circle>
            </g>
          );
        })}
      </svg>

      {/* Driver labels */}
      <div className="absolute right-2 top-0 bottom-0 flex flex-col justify-around py-4">
        {DRIVERS.map((driver) => (
          <span
            key={driver.code}
            className="text-[10px] font-bold font-mono tracking-wider"
            style={{ color: driver.color }}
          >
            {driver.code}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Circuit path animation ──────────────────────────────────────────
function CircuitAnimation() {
  return (
    <svg viewBox="0 0 400 200" className="w-full h-full opacity-20" fill="none">
      <path
        d="M50,100 C50,50 100,20 150,20 C200,20 220,50 250,50 C280,50 300,30 330,50 C360,70 370,100 350,130 C330,160 300,170 270,170 C240,170 220,150 190,150 C160,150 140,170 110,170 C80,170 50,150 50,100Z"
        stroke="#e10600"
        strokeWidth="2"
        strokeDasharray="8 4"
        className="animate-[dash_20s_linear_infinite]"
      />
      {/* Moving car dot */}
      <circle r="4" fill="#e10600">
        <animateMotion
          dur="8s"
          repeatCount="indefinite"
          path="M50,100 C50,50 100,20 150,20 C200,20 220,50 250,50 C280,50 300,30 330,50 C360,70 370,100 350,130 C330,160 300,170 270,170 C240,170 220,150 190,150 C160,150 140,170 110,170 C80,170 50,150 50,100Z"
        />
      </circle>
      <circle r="8" fill="#e10600" opacity="0.3">
        <animateMotion
          dur="8s"
          repeatCount="indefinite"
          path="M50,100 C50,50 100,20 150,20 C200,20 220,50 250,50 C280,50 300,30 330,50 C360,70 370,100 350,130 C330,160 300,170 270,170 C240,170 220,150 190,150 C160,150 140,170 110,170 C80,170 50,150 50,100Z"
        />
      </circle>
    </svg>
  );
}

// ─── Feature cards ───────────────────────────────────────────────────
const features = [
  {
    icon: Activity,
    title: "Live Telemetry",
    description: "Speed, throttle, brake and DRS data for every driver, every lap.",
  },
  {
    icon: Timer,
    title: "Lap Analysis",
    description: "Compare lap times across sessions, compounds and weather conditions.",
  },
  {
    icon: Trophy,
    title: "Championship Tracker",
    description: "Real-time standings with progression charts and historical comparisons.",
  },
  {
    icon: BarChart3,
    title: "Strategy Analyzer",
    description: "Pit stop timing, tire stint analysis and undercut/overcut scenarios.",
  },
  {
    icon: Radio,
    title: "Team Radio",
    description: "Session-by-session radio transcripts with timestamps and context.",
  },
  {
    icon: Zap,
    title: "Head-to-Head",
    description: "Career and race-by-race driver comparisons with detailed metrics.",
  },
];

// ─── Hero Page ───────────────────────────────────────────────────────
export default function HeroPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="min-h-screen bg-[#15151e] text-white overflow-hidden">
      {/* Navigation bar */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06]" style={{ background: "rgba(21,21,30,0.92)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-8 h-8 rounded font-black text-white text-xs"
              style={{ background: "#e10600", fontFamily: "Titillium Web, sans-serif", letterSpacing: "0.05em" }}
            >
              F1
            </div>
            <span
              className="font-black text-sm uppercase tracking-widest"
              style={{ fontFamily: "Titillium Web, sans-serif", letterSpacing: "0.15em" }}
            >
              Pulse
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="text-sm font-semibold text-white/50 hover:text-white transition-colors"
              style={{ fontFamily: "Titillium Web, sans-serif" }}
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white transition-all duration-300 hover:shadow-[0_0_20px_rgba(225,6,0,0.3)]"
              style={{ background: "#e10600", fontFamily: "Titillium Web, sans-serif" }}
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
        {/* Red accent line */}
        <div className="h-[2px] bg-gradient-to-r from-transparent via-[#e10600] to-transparent" />
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 px-4 sm:px-6 lg:px-8">
        {/* Background circuit animation */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[600px] h-[300px] sm:w-[800px] sm:h-[400px]">
            <CircuitAnimation />
          </div>
        </div>

        {/* Grid dot pattern */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(rgba(225,6,0,0.03) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        <div className="relative max-w-5xl mx-auto text-center">
          {/* Badge */}
          <div
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#e10600]/20 bg-[#e10600]/[0.06] mb-8 transition-all duration-700 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#e10600] animate-pulse" />
            <span
              className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#e10600]"
              style={{ fontFamily: "Titillium Web, sans-serif" }}
            >
              Live Race Data
            </span>
          </div>

          {/* Headline */}
          <h1
            className={`text-4xl sm:text-6xl lg:text-7xl font-black uppercase leading-[0.95] tracking-tight mb-6 transition-all duration-700 delay-100 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            }`}
            style={{ fontFamily: "Titillium Web, sans-serif", letterSpacing: "-0.02em" }}
          >
            <span className="text-white">Race Analytics</span>
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: "linear-gradient(135deg, #e10600 0%, #ff4136 50%, #ffc906 100%)",
              }}
            >
              At Full Speed
            </span>
          </h1>

          {/* Subheadline */}
          <p
            className={`max-w-2xl mx-auto text-base sm:text-lg text-white/45 leading-relaxed mb-10 transition-all duration-700 delay-200 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            }`}
            style={{ fontFamily: "Titillium Web, sans-serif" }}
          >
            Real-time telemetry, lap-by-lap strategy analysis, and championship tracking.
            Every session. Every compound. Every overtake.
          </p>

          {/* CTA buttons */}
          <div
            className={`flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 transition-all duration-700 delay-300 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            }`}
          >
            <Link
              href="/sign-up"
              className="group flex items-center gap-3 px-8 py-3.5 rounded-lg text-sm font-bold uppercase tracking-wider text-white transition-all duration-300 hover:shadow-[0_0_30px_rgba(225,6,0,0.4)] hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, #e10600, #cc0500)",
                fontFamily: "Titillium Web, sans-serif",
              }}
            >
              <Flag className="w-4 h-4" />
              Start Analyzing
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
            <Link
              href="#features"
              className="flex items-center gap-2 px-8 py-3.5 rounded-lg text-sm font-bold uppercase tracking-wider text-white/60 border border-white/[0.08] hover:border-white/[0.15] hover:text-white/80 transition-all duration-300"
              style={{ fontFamily: "Titillium Web, sans-serif" }}
            >
              See Features
            </Link>
          </div>

          {/* Race position chart preview */}
          <div
            className={`relative glass-card overflow-hidden transition-all duration-700 delay-[400ms] ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#e10600] animate-pulse" />
                <span className="section-title">Race Position Timeline</span>
              </div>
              <span className="text-[10px] font-mono text-white/20">LIVE PREVIEW</span>
            </div>
            <div className="p-4">
              <RaceChart />
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-white/[0.06] bg-[#1e1e2a]/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-2 sm:grid-cols-4 gap-8">
          {[
            { label: "Races Tracked", value: 450 },
            { label: "Drivers", value: 20 },
            { label: "Data Points / Race", value: 50000 },
            { label: "Sessions / Weekend", value: 5 },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="stat-number text-white mb-1">
                {mounted ? (
                  <AnimatedNumber target={stat.value} />
                ) : (
                  0
                )}
                {stat.value >= 1000 && "+"}
              </div>
              <div className="section-title">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section id="features" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2
              className="text-2xl sm:text-3xl font-black uppercase tracking-tight mb-4"
              style={{ fontFamily: "Titillium Web, sans-serif" }}
            >
              Every Metric.{" "}
              <span style={{ color: "#e10600" }}>Every Lap.</span>
            </h2>
            <p
              className="text-white/40 max-w-lg mx-auto"
              style={{ fontFamily: "Titillium Web, sans-serif" }}
            >
              From practice to podium, F1 Pulse gives you the data that matters.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature, i) => (
              <div
                key={feature.title}
                className="glass-card-hover p-6 group"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-[#e10600]/[0.08] border border-[#e10600]/[0.12] group-hover:bg-[#e10600]/[0.15] transition-colors">
                    <feature.icon className="w-[18px] h-[18px] text-[#e10600]" />
                  </div>
                  <h3
                    className="text-sm font-bold uppercase tracking-wide"
                    style={{ fontFamily: "Titillium Web, sans-serif" }}
                  >
                    {feature.title}
                  </h3>
                </div>
                <p className="text-sm text-white/40 leading-relaxed" style={{ fontFamily: "Titillium Web, sans-serif" }}>
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-t border-white/[0.06]">
        <div className="max-w-3xl mx-auto text-center">
          <h2
            className="text-2xl sm:text-3xl font-black uppercase tracking-tight mb-4"
            style={{ fontFamily: "Titillium Web, sans-serif" }}
          >
            Ready to{" "}
            <span style={{ color: "#e10600" }}>dive in?</span>
          </h2>
          <p
            className="text-white/40 mb-8 max-w-md mx-auto"
            style={{ fontFamily: "Titillium Web, sans-serif" }}
          >
            Sign up and get instant access to live telemetry, race strategy breakdowns, and championship analytics.
          </p>
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-3 px-8 py-3.5 rounded-lg text-sm font-bold uppercase tracking-wider text-white transition-all duration-300 hover:shadow-[0_0_30px_rgba(225,6,0,0.4)] hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, #e10600, #cc0500)",
              fontFamily: "Titillium Web, sans-serif",
            }}
          >
            Get Started Free
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded flex items-center justify-center text-[8px] font-black text-white"
              style={{ background: "#e10600", fontFamily: "Titillium Web, sans-serif" }}
            >
              F1
            </div>
            <span className="text-xs text-white/20">F1 Pulse — Race Analytics</span>
          </div>
          <span className="text-xs text-white/15">
            Data powered by OpenF1 &amp; Jolpica APIs
          </span>
        </div>
      </footer>
    </div>
  );
}
