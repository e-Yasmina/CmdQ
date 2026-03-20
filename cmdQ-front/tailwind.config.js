import { PALETTE } from './src/theme/palette.js';

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: PALETTE.background,
                panel: PALETTE.panel,
                border: PALETTE.border,
                primary: PALETTE.primary,
                secondary: PALETTE.secondary,
                textPrimary: PALETTE.textPrimary,
            },
            fontFamily: {
                ui: ['Inter', 'Geist', 'sans-serif'],
                code: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
            },
        },
    },
    plugins: [],
}
