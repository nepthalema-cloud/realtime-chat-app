import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { User, LoginCredentials, RegisterCredentials } from "../types/auth";
import { api, tokenStorage, ApiClientError, setOnUnauthorizedListener } from "../services/api";

export interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  fieldErrors: Record<string, string>;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(tokenStorage.get());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearError = useCallback(() => {
    setError(null);
    setFieldErrors({});
  }, []);

  const logout = useCallback(() => {
    tokenStorage.remove();
    setToken(null);
    setUser(null);
    clearError();
  }, [clearError]);

  // Hook 401 callback into API client
  useEffect(() => {
    setOnUnauthorizedListener(() => {
      logout();
    });
  }, [logout]);

  // Restore authenticated session on initial load
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      const storedToken = tokenStorage.get();
      if (!storedToken) {
        if (isMounted) {
          setIsLoading(false);
        }
        return;
      }

      try {
        const response = await api.auth.getMe();
        if (isMounted) {
          setUser(response.user);
          setToken(storedToken);
        }
      } catch (err) {
        if (isMounted) {
          // If the token is invalid or expired (401), clean up
          tokenStorage.remove();
          setToken(null);
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (credentials: LoginCredentials): Promise<void> => {
    setIsSubmitting(true);
    clearError();

    try {
      const response = await api.auth.login(credentials);
      tokenStorage.set(response.token);
      setToken(response.token);
      setUser(response.user);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
        if (err.fieldErrors && err.fieldErrors.length > 0) {
          const map: Record<string, string> = {};
          for (const item of err.fieldErrors) {
            map[item.field] = item.message;
          }
          setFieldErrors(map);
        }
      } else {
        setError("Unable to log in. Please try again later.");
      }
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const register = async (credentials: RegisterCredentials): Promise<void> => {
    setIsSubmitting(true);
    clearError();

    try {
      const response = await api.auth.register(credentials);
      tokenStorage.set(response.token);
      setToken(response.token);
      setUser(response.user);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
        if (err.fieldErrors && err.fieldErrors.length > 0) {
          const map: Record<string, string> = {};
          for (const item of err.fieldErrors) {
            map[item.field] = item.message;
          }
          setFieldErrors(map);
        }
      } else {
        setError("Unable to register account. Please try again later.");
      }
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        isSubmitting,
        error,
        fieldErrors,
        login,
        register,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
