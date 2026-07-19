import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Agendar from './pages/Agendar.jsx';
import Painel from './pages/Painel.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/agendar" replace />} />
        <Route path="/agendar" element={<Agendar />} />
        <Route path="/painel" element={<Painel />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
