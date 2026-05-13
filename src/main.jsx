import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Admin from "./pages/Admin";
import Checkin from "./pages/Checkin";
import Validar from "./pages/Validar";
import Login from "./pages/Login";

function ProtectedAdmin() {
  const [auth, setAuth] = useState(null); // null=loading, false=not logged, object=logged
  
  useEffect(() => {
    const token = localStorage.getItem("sb_token");
    const user = localStorage.getItem("sb_user");
    if (token && user) {
      setAuth({ token, user: JSON.parse(user) });
    } else {
      setAuth(false);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("sb_token");
    localStorage.removeItem("sb_refresh");
    localStorage.removeItem("sb_user");
    setAuth(false);
  };

  if (auth === null) return null; // loading
  if (!auth) return <Login onLogin={(data) => setAuth({ token: data.access_token, user: data.user })} />;
  return <Admin onLogout={handleLogout} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Painel admin protegido */}
        <Route path="/" element={<ProtectedAdmin />} />
        {/* Tela de check-in do aluno (pública) */}
        <Route path="/c/:turmaId" element={<Checkin />} />
        {/* Validação de certificado (pública) */}
        <Route path="/validar" element={<Validar />} />
        <Route path="/validar/:codigo" element={<Validar />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
