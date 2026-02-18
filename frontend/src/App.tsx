import React, { useState, useEffect } from "react";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import {
  setAccessToken,
  getAccessToken,
  refreshAccessToken,
  logout as apiLogout,
} from "./api";

const App: React.FC = () => {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // On mount, try to silently refresh the access token using the refresh cookie.
    refreshAccessToken()
      .then((token) => {
        if (token) {
          setAuthenticated(true);
        }
      })
      .finally(() => setChecking(false));
  }, []);

  const handleLogin = (token: string) => {
    setAccessToken(token);
    setAuthenticated(true);
  };

  const handleLogout = async () => {
    await apiLogout();
    setAuthenticated(false);
  };

  if (checking) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!authenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return <Dashboard token={getAccessToken() ?? ""} onLogout={handleLogout} />;
};

export default App;
