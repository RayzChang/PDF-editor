import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useUIStore } from '../../store/ui-store';

export const ThemeToggle: React.FC = () => {
    const { theme, setTheme } = useUIStore();
    const isDark = theme === 'dark';

    const toggleTheme = () => {
        setTheme(isDark ? 'light' : 'dark');
    };

    return (
        <button
            className="toolbar-button"
            onClick={toggleTheme}
            title={isDark ? 'Light Mode' : 'Dark Mode'}
        >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
    );
};
