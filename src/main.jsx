import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Admin from "./pages/Admin";
import Checkin from "./pages/Checkin";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Painel admin */}
        <Route path="/" element={<Admin />} />
        {/* Tela de check-in do aluno */}
        <Route path="/c/:turmaId" element={<Checkin />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
