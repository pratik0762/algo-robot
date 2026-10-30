/**
 * Dynamic API Base resolution matching browser origin.
 * Prevents cross-origin / localhost vs 127.0.0.1 mismatch and CORS fetch failures.
 */

export const getApiBase = (): string => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname || 'localhost';
    return `http://${hostname}:8000`;
  }
  return 'http://127.0.0.1:8000';
};

export const getWsBase = (): string => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname || 'localhost';
    return `ws://${hostname}:8000`;
  }
  return 'ws://127.0.0.1:8000';
};

