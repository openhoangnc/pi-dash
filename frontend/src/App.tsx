import React, { useState, useEffect } from "react";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { getAccessToken, refreshAccessToken, logout as apiLogout } from "./api";

const App: React.FC = () => {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // On mount, restore session: use existing access token or try to refresh.
    const existing = getAccessToken();
    if (existing) {
      setAuthenticated(true);
      setChecking(false);
    } else {
      refreshAccessToken()
        .then((token) => {
          if (token) setAuthenticated(true);
        })
        .finally(() => setChecking(false));
    }
  }, []);

  const handleLogin = () => {
    // login() in api.ts already stored both tokens; just update state.
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
