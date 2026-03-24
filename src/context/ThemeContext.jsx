import React, { useEffect } from 'react';
import { ThemeContext } from './ThemeContextValue';
import { useStore } from '../store/useStore';

export const ThemeProvider = ({ children }) => {
    const isDarkMode = useStore((state) => state.isDarkMode);

    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
        }
    }, [isDarkMode]);

    const value = {
        theme: isDarkMode ? 'dark' : 'light',
        isDark: isDarkMode,
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};
