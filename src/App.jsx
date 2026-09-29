import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from './components/DashboardLayout';
import ExecutiveOverview from './modules/ExecutiveOverview';
import AppReliability from './modules/AppReliability';
import ChangeImpact from './modules/ChangeImpact';
import ITtoOTHealth from './modules/ITtoOTHealth';

function App() {
  return (
    <Router>
      <DashboardLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/executive-overview" replace />} />
          
          <Route path="/executive-overview" element={<ExecutiveOverview />} />
          <Route path="/app-reliability" element={<AppReliability />} />
          <Route path="/change-impact" element={<ChangeImpact />} />
          
          {/* FIXED: Removed the extra "-to-" to match the layout navigation */}
          <Route path="/it-ot-health" element={<ITtoOTHealth />} />
          
          <Route path="*" element={<Navigate to="/executive-overview" replace />} />
        </Routes>
      </DashboardLayout>
    </Router>
  );
}

export default App;