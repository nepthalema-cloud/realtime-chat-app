import {
  AuthResponse,
  LoginCredentials,
  RegisterCredentials,
  User,
  ApiError,
} from "../types/auth";
import {
  Conversation,
  Message,
  PaginatedMessagesResponse,
} from "../types/chat";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "chat_auth_token";

export class ApiClientError extends Error {
  public status: number;
  public details?: unknown;
  public fieldErrors?: Array<{ field: string; message: string }>;

  constructor(status: number, message: string, details?: unknown, fieldErrors?: Array<{ field: string; message: string }>) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.details = details;
    this.fieldErrors = fieldErrors;
  }
}

// Token storage helper (localStorage)
export const tokenStorage = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string): void => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Handle private browsing or quota limits
    }
  },
  remove: (): void => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Ignore storage errors on cleanup
    }
  },
};

// Global unauthorized listener callback for session expiry
let onUnauthorizedCallback: (() => void) | null = null;

export const setOnUnauthorizedListener = (callback: () => void): void => {
  onUnauthorizedCallback = callback;
};

// Core typed fetch wrapper
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = tokenStorage.get();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Handle leading slashes cleanly
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${API_BASE}${normalizedEndpoint}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers,
    });
  } catch (networkError) {
    throw new ApiClientError(0, "Unable to connect to the backend server. Please check your network connection.");
  }

  // Parse response
  let data: unknown;
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = {};
    }
  } else {
    data = {};
  }

  if (!res.ok) {
    // Session expired or invalid token
    if (res.status === 401 && token) {
      tokenStorage.remove();
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }
    }

    const errorResponse = data as Partial<ApiError>;
    throw new ApiClientError(
      res.status,
      errorResponse.message || `Request failed with status ${res.status}`,
      errorResponse.details,
      errorResponse.errors
    );
  }

  return data as T;
}

// API endpoint methods
export const api = {
  auth: {
    register: (credentials: RegisterCredentials): Promise<AuthResponse> =>
      request<AuthResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify(credentials),
      }),

    login: (credentials: LoginCredentials): Promise<AuthResponse> =>
      request<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      }),

    getMe: (): Promise<{ success: boolean; user: User }> =>
      request<{ success: boolean; user: User }>("/auth/me", {
        method: "GET",
      }),
  },

  users: {
    list: (search?: string): Promise<{ success: boolean; users: User[] }> => {
      const query = search ? `?search=${encodeURIComponent(search)}` : "";
      return request<{ success: boolean; users: User[] }>(`/users${query}`, {
        method: "GET",
      });
    },
  },

  conversations: {
    list: (): Promise<{ success: boolean; conversations: Conversation[] }> =>
      request<{ success: boolean; conversations: Conversation[] }>("/conversations", {
        method: "GET",
      }),

    create: (recipientId: string): Promise<{ success: boolean; conversation: Conversation; isNew: boolean }> =>
      request<{ success: boolean; conversation: Conversation; isNew: boolean }>("/conversations", {
        method: "POST",
        body: JSON.stringify({ recipientId }),
      }),

    get: (id: string): Promise<{ success: boolean; conversation: Conversation }> =>
      request<{ success: boolean; conversation: Conversation }>(`/conversations/${id}`, {
        method: "GET",
      }),

    markRead: (id: string): Promise<{ success: boolean; conversationId: string; lastReadAt: string }> =>
      request<{ success: boolean; conversationId: string; lastReadAt: string }>(`/conversations/${id}/read`, {
        method: "PATCH",
      }),
  },

  messages: {
    list: (conversationId: string, cursor?: string, limit: number = 40): Promise<PaginatedMessagesResponse> => {
      const params = new URLSearchParams();
      params.set("limit", limit.toString());
      if (cursor) params.set("cursor", cursor);
      return request<PaginatedMessagesResponse>(`/conversations/${conversationId}/messages?${params.toString()}`, {
        method: "GET",
      });
    },

    send: (conversationId: string, content: string): Promise<{ success: boolean; message: Message }> =>
      request<{ success: boolean; message: Message }>(`/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
  },
};
