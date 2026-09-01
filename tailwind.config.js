/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}","./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: { colors: { dark: '#0a0a0a', darker: '#050505', red: { primary: '#dc2626', dark: '#991b1b', light: '#ef4444', glow: 'rgba(220,38,38,0.3)' } } } },
  plugins: [],
};