import { useState, useCallback } from 'react';
import { apiClient, ApiRequestError } from '../services/ApiClient';

interface ApiState {
  connected: boolean;
  loading: boolean;
  error: string | null;
  user: { id: number; username: string; role: string } | null;
}

const API_BASE_URL_KEY = 'ai-sport-api-url';

export function useApi() {
  const [state, setState] = useState<ApiState>({
    connected: apiClient.getTokens() !== null,
    loading: false,
    error: null,
    user: null,
  });

  const getBaseUrl = useCallback(() => {
    return localStorage.getItem(API_BASE_URL_KEY) ?? 'http://localhost:3000/api';
  }, []);

  const setBaseUrl = useCallback((url: string) => {
    localStorage.setItem(API_BASE_URL_KEY, url);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const result = await apiClient.login(username, password);
      setState({
        connected: true,
        loading: false,
        error: null,
        user: result.user,
      });
      return result;
    } catch (err) {
      const message = err instanceof ApiRequestError ? err.message : 'Connection failed';
      setState((s) => ({ ...s, loading: false, error: message }));
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    apiClient.setTokens(null);
    setState({ connected: false, loading: false, error: null, user: null });
  }, []);

  return { ...state, login, logout, getBaseUrl, setBaseUrl };
}
