import React, { useState, useEffect } from "react";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";

const App: React.FC = () => {
  const [token, setToken] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("pi_dash_token");
    if (stored) {
      // Validate token
      fetch("/api/auth", {
        headers: { Authorization: `Bearer ${stored}` },
      })
        .then((res) => {
          if (res.ok) {
            setToken(stored);
          } else {
            localStorage.removeItem("pi_dash_token");
          }
        })
        .catch(() => {
          localStorage.removeItem("pi_dash_token");
        })
        .finally(() => setChecking(false));
    } else {
      setChecking(false);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("pi_dash_token");
    setToken(null);
  };

  if (checking) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!token) {
    return <Login onLogin={setToken} />;
  }

  return <Dashboard token={token} onLogout={handleLogout} />;
};

export default App;
