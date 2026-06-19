/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: "#0f1115",
        surface: "#171a21",
        elevated: "#1e222b",
        border: "#262b36",
        accent: "#3b82f6",
        muted: "#8b93a7",
      },
    },
  },
  plugins: [],
};
