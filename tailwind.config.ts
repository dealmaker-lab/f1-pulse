import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* F1 Dark System */
        f1: {
          black:   '#15151e',
          surface: '#1e1e2a',
          card:    '#22222f',
          border:  'rgba(255,255,255,0.07)',
          muted:   '#606066',
          red:     '#e10600',
        },
        /* Legacy carbon tokens → now point to F1 dark palette */
        carbon: {
          950: '#15151e',
          900: '#1e1e2a',
          800: '#22222f',
          700: '#2a2a3a',
          600: '#333348',
          500: '#3c3c54',
        },
        /* Racing accents — red is now primary */
        racing: {
          red:    '#e10600',
          blue:   '#e10600',   // alias: redirected to F1 red
          amber:  '#ffc906',   // F1 yellow / podium gold
          green:  '#00d2be',   // Mercedes turquoise (kept for team color)
          purple: '#9b5de5',
          cyan:   '#06b6d4',
        },
        /* Ferrari-inspired neutral gray scale (achromatic) */
        neutral: {
          'near-black': '#181818',
          'dark':       '#666666',
          'mid':        '#8F8F8F',
          'silver':     '#969696',
          'border':     '#CCCCCC',
          'light':      '#D2D2D2',
        },
        /* Ferrari-inspired red state hierarchy */
        accent: {
          DEFAULT: '#e10600',    // F1 red (primary — unchanged)
          hover:   '#B01E0A',    // darker for hover/pressed
          pressed: '#9D2211',    // deepest for active state
        },
        /* Semantic status colors (Ferrari system) */
        status: {
          warning: '#F13A2C',
          success: '#03904A',
          info:    '#4C98B9',
        },
        /* Tire compound colours (unchanged) */
        tire: {
          soft:   '#ff3333',
          medium: '#ffc906',
          hard:   '#e8e8e8',
          inter:  '#39b54a',
          wet:    '#0067ff',
        },
        drs: {
          active:   '#00ff00',
          inactive: '#666666',
        },
      },
      fontFamily: {
        /* F1 official body font */
        sans:    ['Titillium Web', 'system-ui', 'sans-serif'],
        display: ['Titillium Web', 'system-ui', 'sans-serif'],
        /* Keep Fira Code for telemetry/mono values */
        mono:    ['Fira Code', 'monospace'],
      },
      fontSize: {
        /* F1-style condensed display sizes */
        'f1-xs':  ['10px', { lineHeight: '1.4', letterSpacing: '0.12em', fontWeight: '700' }],
        'f1-sm':  ['12px', { lineHeight: '1.4', letterSpacing: '0.06em', fontWeight: '700' }],
        'f1-md':  ['14px', { lineHeight: '1.3', letterSpacing: '0.02em', fontWeight: '700' }],
        'f1-lg':  ['18px', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '900' }],
        'f1-xl':  ['24px', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '900' }],
        'f1-2xl': ['32px', { lineHeight: '1.0', letterSpacing: '-0.02em', fontWeight: '900' }],
        /* Ferrari-inspired editorial hierarchy (medium weights) */
        'ferrari-section':  ['26px', { lineHeight: '1.20', fontWeight: '500' }],
        'ferrari-card':     ['24px', { lineHeight: 'normal', fontWeight: '400' }],
        'ferrari-sub':      ['18px', { lineHeight: '1.20', fontWeight: '700' }],
        'ferrari-ui':       ['16px', { lineHeight: '1.40', letterSpacing: '0.005em', fontWeight: '500' }],
        'ferrari-button':   ['16px', { lineHeight: 'normal', letterSpacing: '0.08em', fontWeight: '400' }],
        'ferrari-nav':      ['13px', { lineHeight: '1.20', letterSpacing: '0.01em', fontWeight: '600' }],
        'ferrari-caption':  ['13px', { lineHeight: '1.50', letterSpacing: '0.015em', fontWeight: '400' }],
        'ferrari-label':    ['12px', { lineHeight: '1.27', letterSpacing: '0.083em', fontWeight: '400' }],
        'ferrari-micro':    ['11px', { lineHeight: '1.27', letterSpacing: '0.083em', fontWeight: '400' }],
      },
      animation: {
        'pulse-glow':    'pulse-glow 2s ease-in-out infinite',
        'slide-up':      'slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in':      'slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in':       'fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in-up':    'fade-in-up 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in':      'scale-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'shimmer':       'shimmer 2s linear infinite',
        'spin-slow':     'spin 3s linear infinite',
        'bounce-subtle': 'bounce-subtle 2s ease-in-out infinite',
        'glow-pulse':    'glow-pulse 3s ease-in-out infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 5px rgba(225,6,0,0.3)' },
          '50%':       { boxShadow: '0 0 20px rgba(225,6,0,0.6)' },
        },
        'slide-up': {
          '0%':   { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        'slide-in': {
          '0%':   { transform: 'translateX(-12px)', opacity: '0' },
          '100%': { transform: 'translateX(0)',     opacity: '1' },
        },
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-up': {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%':   { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'bounce-subtle': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':       { transform: 'translateY(-2px)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.4' },
          '50%':       { opacity: '1' },
        },
      },
      backgroundImage: {
        /* F1 carbon diagonal stripe */
        'carbon-stripe': 'repeating-linear-gradient(-55deg, transparent, transparent 8px, rgba(255,255,255,0.018) 8px, rgba(255,255,255,0.018) 16px)',
        /* Subtle dot grid */
        'grid-pattern':  'radial-gradient(rgba(225,6,0,0.03) 1px, transparent 1px)',
        /* Shimmer */
        'shimmer-gradient': 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)',
      },
      backgroundSize: {
        'grid':    '28px 28px',
        'shimmer': '200% 100%',
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      borderRadius: {
        'f1':       '4px',   // F1 uses tighter radii on data rows
        'ferrari':  '2px',   // Ferrari razor-precision default
        'ferrari-dialog': '8px', // Ferrari modal/dialog radius
      },
      screens: {
        'xs': '375px',    // Ferrari mobile small
        'tablet': '960px', // Ferrari tablet-to-desktop threshold
      },
    },
  },
  plugins: [],
};

export default config;
