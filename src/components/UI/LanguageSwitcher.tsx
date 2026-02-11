import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { useUIStore } from '../../store/ui-store';
import type { Language } from '../../store/ui-store';

export const LanguageSwitcher: React.FC = () => {
    const { i18n } = useTranslation();
    const { language, setLanguage } = useUIStore();
    const [isOpen, setIsOpen] = React.useState(false);

    // Define languages inside the component to avoid global scope if preferred,
    // and to allow for potential dynamic changes or memoization.
    // The provided snippet simplifies the language list and removes flags.
    const languages: { code: Language; name: string; flag?: string }[] = [
        { code: 'zh-TW', name: '繁體中文', flag: '🇹🇼' },
        { code: 'zh-CN', name: '简体中文', flag: '🇨🇳' },
        { code: 'en', name: 'English', flag: '🇬🇧' },
        { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳' },
    ];

    const handleLanguageChange = (lang: Language) => {
        setLanguage(lang);
        i18n.changeLanguage(lang);
        setIsOpen(false);
    };

    // This variable was unused, causing a lint error. It's now commented out.
    // const currentLanguage = languages.find((l) => l.code === language);

    return (
        <div className="language-switcher" style={{ position: 'relative' }}>
            <button
                className="toolbar-button"
                onClick={() => setIsOpen(!isOpen)}
                title="Language / 語言"
            >
                <Globe size={20} />
            </button>

            {isOpen && (
                <>
                    <div
                        className="overlay"
                        onClick={() => setIsOpen(false)}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            zIndex: 999,
                        }}
                    />
                    <div
                        className="language-menu"
                        style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            marginTop: 'var(--spacing-xs)',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: 'var(--radius-md)',
                            boxShadow: 'var(--shadow-lg)',
                            minWidth: '180px',
                            zIndex: 1000,
                            overflow: 'hidden',
                        }}
                    >
                        {languages.map((lang) => (
                            <button
                                key={lang.code}
                                onClick={() => handleLanguageChange(lang.code)}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'var(--spacing-sm)',
                                    padding: 'var(--spacing-sm) var(--spacing-md)',
                                    background: lang.code === language ? 'var(--bg-secondary)' : 'transparent',
                                    color: 'var(--text-primary)',
                                    border: 'none',
                                    cursor: 'pointer',
                                    transition: 'background var(--transition-fast)',
                                    textAlign: 'left',
                                }}
                                onMouseEnter={(e) => {
                                    if (lang.code !== language) {
                                        e.currentTarget.style.background = 'var(--bg-secondary)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (lang.code !== language) {
                                        e.currentTarget.style.background = 'transparent';
                                    }
                                }}
                            >
                                <span style={{ fontSize: '1.25rem' }}>{lang.flag}</span>
                                <span>{lang.name}</span>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};
