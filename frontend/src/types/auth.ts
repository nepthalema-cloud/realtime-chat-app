export interface User {
  id: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user: User;
  token: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  username: string;
  email: string;
  password: string;
}

export interface ApiError {
  success: false;
  message: string;
  details?: unknown;
  errors?: Array<{ field: string; message: string }>;
}
