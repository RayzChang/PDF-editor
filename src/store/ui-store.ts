import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Language = 'zh-TW' | 'zh-CN' | 'en' | 'vi';
export type Theme = 'light' | 'dark' | 'auto';

interface UIState {
    // 語言設定
    language: Language;
    setLanguage: (lang: Language) => void;

    // 主題設定
    theme: Theme;
    setTheme: (theme: Theme) => void;

    // UI 狀態
    sidebarOpen: boolean;
    toggleSidebar: () => void;
    setSidebarOpen: (open: boolean) => void;

    // 轉換面板
    converterOpen: boolean;
    toggleConverter: () => void;
    setConverterOpen: (open: boolean) => void;

    // 載入狀態
    loading: boolean;
    setLoading: (loading: boolean) => void;

    // 錯誤訊息
    error: string | null;
    setError: (error: string | null) => void;
}

export const useUIStore = create<UIState>()(
    persist(
        (set) => ({
            language: 'zh-TW',
            setLanguage: (lang) => set({ language: lang }),

            theme: 'light',
            setTheme: (theme) => {
                set({ theme });
                applyTheme(theme);
            },

            sidebarOpen: true,
            toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
            setSidebarOpen: (open) => set({ sidebarOpen: open }),

            converterOpen: false,
            toggleConverter: () => set((state) => ({ converterOpen: !state.converterOpen })),
            setConverterOpen: (open) => set({ converterOpen: open }),

            loading: false,
            setLoading: (loading) => set({ loading }),

            error: null,
            setError: (error) => set({ error }),
        }),
        {
            name: 'pdf-editor-ui',
            partialize: (state) => ({
                language: state.language,
                theme: state.theme,
                sidebarOpen: state.sidebarOpen,
            }),
        }
    )
);

// 應用主題
function applyTheme(theme: Theme) {
    const root = document.documentElement;

    if (theme === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
        root.setAttribute('data-theme', theme);
    }
}

// 初始化主題
if (typeof window !== 'undefined') {
    const storedTheme = localStorage.getItem('pdf-editor-ui');
    if (storedTheme) {
        try {
            const { state } = JSON.parse(storedTheme);
            applyTheme(state.theme || 'light');
        } catch (e) {
            applyTheme('light');
        }
    }
}
