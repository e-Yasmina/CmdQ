export interface ThemePalette {
    background: string;
    panel: string;
    border: string;
    primary: string;
    secondary: string;
    textPrimary: string;
    textSecondary: string;
    chartRose: string;
    chartEmerald: string;
    chartBlue: string;
    chartViolet: string;
    chartPink: string;
    chartAmber: string;
    chartIndigo: string;
    tooltipBg: string;
    chartBorder: string;
    chartTextWhite: string;
    chartTextMuted: string;
    chartCursorFill: string;
    shadowInset: string;
    inputBg: string;
    hoverBg: string;
    translateBtnBg: string;
    translateBtnBorder: string;
    translateBtnText: string;
    translateBtnHoverBg: string;
    translateBtnHoverText: string;
}

export const DARK_PALETTE: ThemePalette = {
    // Theme Core
    background: '#0D1117',
    panel: '#161B22',
    border: '#30363D',
    primary: '#00ffffff',
    secondary: '#58A6FF',
    textPrimary: '#C9D1D9',
    textSecondary: '#8B949E',

    // Charts & Analytics Data Series
    chartRose: '#f43f5e',
    chartEmerald: '#10b981',
    chartBlue: '#3b82f6',
    chartViolet: '#8b5cf6',
    chartPink: '#ec4899',
    chartAmber: '#f59e0b',
    chartIndigo: '#6366f1',

    // Chart Components (Grid, Tooltip, Axis)
    tooltipBg: '#1e1e24',
    chartBorder: '#30363D',
    chartTextWhite: '#f0f6fc',
    chartTextMuted: '#8B949E',
    chartCursorFill: 'rgba(255, 255, 255, 0.04)',

    // Shadows & Misc
    shadowInset: 'rgba(0,0,0,0.2)',
    inputBg: '#0D1117',
    hoverBg: 'rgba(255, 255, 255, 0.05)',

    // Translate Button (Exact Original Dark Styling)
    translateBtnBg: '#2a1b38',
    translateBtnBorder: 'rgba(210, 136, 255, 0.5)',
    translateBtnText: '#e0a8ff',
    translateBtnHoverBg: '#d288ff',
    translateBtnHoverText: '#000000',
};

export const LIGHT_PALETTE: ThemePalette = {
    // Theme Core
    background: '#F6F8FA',
    panel: '#FFFFFF',
    border: '#D0D7DE',
    // primary: '#EA580C',
    // primary: '#00FF41',
    primary: '#EF88AD',
    secondary: '#0969DA',
    textPrimary: '#24292F',
    textSecondary: '#57606A',

    // Charts & Analytics Data Series
    chartRose: '#e11d48',
    chartEmerald: '#059669',
    chartBlue: '#2563eb',
    chartViolet: '#7c3aed',
    chartPink: '#db2777',
    chartAmber: '#d97706',
    chartIndigo: '#4f46e5',

    // Chart Components (Grid, Tooltip, Axis)
    tooltipBg: '#FFFFFF',
    chartBorder: '#D0D7DE',
    chartTextWhite: '#24292F',
    chartTextMuted: '#57606A',
    chartCursorFill: 'rgba(0, 0, 0, 0.04)',

    // Shadows & Misc
    shadowInset: 'rgba(0,0,0,0.04)',
    inputBg: '#FFFFFF',
    hoverBg: 'rgba(0, 0, 0, 0.04)',

    // Translate Button (Light Theme)
    translateBtnBg: '#F3E8FF',
    translateBtnBorder: 'rgba(168, 85, 247, 0.4)',
    translateBtnText: '#7E22CE',
    translateBtnHoverBg: '#A855F7',
    translateBtnHoverText: '#FFFFFF',
};

export function getPalette(theme: 'dark' | 'light' = 'dark'): ThemePalette {
    return theme === 'light' ? LIGHT_PALETTE : DARK_PALETTE;
}

export function applyTheme(theme: 'dark' | 'light') {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const p = getPalette(theme);

    root.setAttribute('data-theme', theme);
    if (theme === 'dark') {
        root.classList.add('dark');
        root.classList.remove('light');
    } else {
        root.classList.add('light');
        root.classList.remove('dark');
    }

    root.style.setProperty('--color-background', p.background);
    root.style.setProperty('--color-panel', p.panel);
    root.style.setProperty('--color-border', p.border);
    root.style.setProperty('--color-primary', p.primary);
    root.style.setProperty('--color-secondary', p.secondary);
    root.style.setProperty('--color-text-primary', p.textPrimary);
    root.style.setProperty('--color-text-secondary', p.textSecondary);
    root.style.setProperty('--color-tooltip-bg', p.tooltipBg);
    root.style.setProperty('--color-chart-border', p.chartBorder);
    root.style.setProperty('--color-shadow-inset', p.shadowInset);
    root.style.setProperty('--color-input-bg', p.inputBg);
    root.style.setProperty('--color-hover-bg', p.hoverBg);
    root.style.setProperty('--color-translate-bg', p.translateBtnBg);
    root.style.setProperty('--color-translate-border', p.translateBtnBorder);
    root.style.setProperty('--color-translate-text', p.translateBtnText);
    root.style.setProperty('--color-translate-hover-bg', p.translateBtnHoverBg);
    root.style.setProperty('--color-translate-hover-text', p.translateBtnHoverText);
}

// For direct backwards compatibility
export const PALETTE = DARK_PALETTE;
