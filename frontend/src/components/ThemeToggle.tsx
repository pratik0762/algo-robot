'use client';

import React, { useEffect, useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle({
  className = '',
  showLabel = true,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        style={{
          width: showLabel ? '110px' : '36px',
          height: '36px',
          borderRadius: '8px',
          background: 'rgba(37, 99, 235, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
        }}
      />
    );
  }

  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      type="button"
      title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
      aria-label="Toggle dark/light theme"
      className={`theme-toggle-btn ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: showLabel ? '7px 12px' : '7px',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '0.8rem',
        fontWeight: 600,
        transition: 'all 0.2s ease',
        background: isDark
          ? 'rgba(37, 99, 235, 0.15)'
          : 'rgba(37, 99, 235, 0.08)',
        border: isDark
          ? '1px solid rgba(59, 130, 246, 0.35)'
          : '1px solid rgba(37, 99, 235, 0.25)',
        color: isDark ? '#93c5fd' : '#1d4ed8',
      }}
    >
      {isDark ? (
        <Sun size={15} style={{ color: '#60a5fa' }} />
      ) : (
        <Moon size={15} style={{ color: '#1d4ed8' }} />
      )}
      {showLabel && (
        <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
      )}
    </button>
  );
}
