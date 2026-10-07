import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import DashboardLayout from './components/DashboardLayout';
import OverviewModule from './modules/overview/OverviewModule';
import ReliabilityModule from './modules/reliability/ReliabilityModule';
import ChangeModule from './modules/change/ChangeModule';

// Old addresses (e.g. the Overview scorecard's /change-impact link from it_ops_overview) keep their query string
function LegacyRedirect({ to }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}
import SecurityModule from './modules/security/SecurityModule';
import LicensingLayout from './modules/licensing/LicensingLayout';
import SubscriptionsPage from './modules/licensing/pages/SubscriptionsPage';
import SpendPage from './modules/licensing/pages/SpendPage';
import UsagePage from './modules/licensing/pages/UsagePage';
import RenewalsPage from './modules/licensing/pages/RenewalsPage';
import VendorsPage from './modules/licensing/pages/VendorsPage';
import DocumentsPage from './modules/licensing/pages/DocumentsPage';

function App() {
  return (
    <Router>
      <DashboardLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/executive-overview" replace />} />

          <Route path="/executive-overview" element={<OverviewModule />} />
          <Route path="/app-reliability" element={<ReliabilityModule />} />
          <Route path="/deployments" element={<ChangeModule />} />
          <Route path="/change-impact" element={<LegacyRedirect to="/deployments" />} />
          <Route path="/security" element={<SecurityModule />} />
          <Route path="/licensing-subs" element={<LicensingLayout />}>
            <Route index element={<SubscriptionsPage />} />
            <Route path="spend" element={<SpendPage />} />
            <Route path="usage" element={<UsagePage />} />
            <Route path="renewals" element={<RenewalsPage />} />
            <Route path="vendors" element={<VendorsPage />} />
            <Route path="documents" element={<DocumentsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/executive-overview" replace />} />
        </Routes>
      </DashboardLayout>
    </Router>
  );
}

export default App;
