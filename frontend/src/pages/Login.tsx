import React, { useState } from "react";
import { login as apiLogin, getAccessToken } from "../api";

interface LoginProps {
  onLogin: (token: string) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiLogin(username, password);
      onLogin(getAccessToken() ?? "");
    } catch {
      setError("Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <form className="login-form" onSubmit={handleSubmit}>
        <div className="login-logo">
          <span className="login-logo-icon">📊</span>
          <h1>Pi Dash</h1>
          <p>Server Monitoring</p>
        </div>
        {error && <div className="login-error">{error}</div>}
        <div className="login-field">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            autoFocus
            autoComplete="username"
          />
        </div>
        <div className="login-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </div>
        <button type="submit" disabled={loading} className="login-btn">
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
};
