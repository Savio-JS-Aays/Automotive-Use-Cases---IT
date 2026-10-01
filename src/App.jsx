import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from './components/DashboardLayout';
import ExecutiveOverview from './modules/ExecutiveOverview';
import AppReliability from './modules/AppReliability';
import ChangeImpact from './modules/ChangeImpact';
import LicensingAndSubs from './modules/LicensingAndSubs';
import Security from './modules/Security';

function App() {
  return (
    <Router>
      <DashboardLayout>
        <Routes>
          {/* Redirect root to your primary executive module */}
          <Route path="/" element={<Navigate to="/executive-overview" replace />} />
          
          <Route path="/executive-overview" element={<ExecutiveOverview />} />
          <Route path="/app-reliability" element={<AppReliability />} />
          <Route path="/licensing-subs" element={<LicensingAndSubs />} />
          <Route path="/security" element={<Security />} />
          <Route path="/change-impact" element={<ChangeImpact />} />
          
          {/* Catch-all fallback */}
          <Route path="*" element={<Navigate to="/executive-overview" replace />} />
        </Routes>
      </DashboardLayout>
    </Router>
  );
}

export default App;