import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.join(dir, "index.html"),
    path.join(dir, "src/**/*.{js,ts,jsx,tsx}"),
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0b0f1a",
        panel: "#121829",
        accent: "#5b8cff",
        accent2: "#3dd6c3",
        muted: "#8b95a8",
      },
      fontFamily: {
        display: ["\"Space Grotesk\"", "system-ui", "sans-serif"],
        body: ["\"DM Sans\"", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
