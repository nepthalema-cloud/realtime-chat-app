import React, { useState } from "react";
import { useAuth } from "../../context/AuthContext";

interface RegisterFormProps {
  onSwitchToLogin: () => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSwitchToLogin }) => {
  const { register, isSubmitting, error, fieldErrors, clearError } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3) {
      errors.username = "Username must be at least 3 characters";
    } else if (trimmedUsername.length > 30) {
      errors.username = "Username cannot exceed 30 characters";
    } else if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      errors.username = "Username can only contain alphanumeric characters and underscores";
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      errors.email = "Email address is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = "Please provide a valid email address";
    }

    if (!password) {
      errors.password = "Password is required";
    } else if (password.length < 6) {
      errors.password = "Password must be at least 6 characters long";
    }

    setClientErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    clearError();

    if (!validateForm()) {
      return;
    }

    try {
      await register({
        username: username.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
    } catch {
      // Backend error is stored in AuthContext and displayed
    }
  };

  const getFieldError = (field: string): string | undefined => {
    return clientErrors[field] || fieldErrors[field];
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo" role="img" aria-label="Chat Bubble">💬</div>
          <h1 className="auth-title">Create Account</h1>
          <p className="auth-subtitle">Join the real-time chat network</p>
        </div>

        {error && (
          <div className="alert alert-danger" role="alert">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate={false}>
          <div className="form-group">
            <label className="form-label" htmlFor="register-username">
              Username
            </label>
            <input
              id="register-username"
              name="username"
              type="text"
              className={`form-input ${getFieldError("username") ? "has-error" : ""}`}
              placeholder="e.g. alex_chen"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (clientErrors.username) {
                  setClientErrors((prev) => ({ ...prev, username: "" }));
                }
              }}
              required
              minLength={3}
              maxLength={30}
              autoComplete="username"
              disabled={isSubmitting}
            />
            {getFieldError("username") && (
              <span className="field-error">{getFieldError("username")}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="register-email">
              Email Address
            </label>
            <input
              id="register-email"
              name="email"
              type="email"
              className={`form-input ${getFieldError("email") ? "has-error" : ""}`}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (clientErrors.email) {
                  setClientErrors((prev) => ({ ...prev, email: "" }));
                }
              }}
              required
              autoComplete="email"
              disabled={isSubmitting}
            />
            {getFieldError("email") && (
              <span className="field-error">{getFieldError("email")}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="register-password">
              Password
            </label>
            <div className="input-wrapper">
              <input
                id="register-password"
                name="password"
                type={showPassword ? "text" : "password"}
                className={`form-input ${getFieldError("password") ? "has-error" : ""}`}
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (clientErrors.password) {
                    setClientErrors((prev) => ({ ...prev, password: "" }));
                  }
                }}
                required
                minLength={6}
                autoComplete="new-password"
                disabled={isSubmitting}
              />
              <button
                type="button"
                className="input-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {getFieldError("password") && (
              <span className="field-error">{getFieldError("password")}</span>
            )}
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                <span>Creating account...</span>
              </>
            ) : (
              "Sign Up"
            )}
          </button>
        </form>

        <div className="auth-toggle">
          Already have an account?
          <button
            type="button"
            className="auth-toggle-link"
            onClick={() => {
              clearError();
              onSwitchToLogin();
            }}
            disabled={isSubmitting}
          >
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
};
