import { useMemo } from 'react';
import { CreditCard, Users, CalendarClock, Trash2, HelpCircle } from 'lucide-react';
import { 
  BarChart, Bar, LineChart, Line, 
  XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, Legend, ResponsiveContainer 
} from 'recharts';
import KpiCard from '../components/KpiCard';
import { useGlobalStore } from '../store/useGlobalStore';

function Hint({ text }) {
  if (!text) return null;
  return (
    <div className="relative group flex items-center">
      <HelpCircle size={16} className="text-slate-400 hover:text-sky-500 cursor-help transition-colors" />
      <div className="absolute bottom-full right-[-8px] mb-2 hidden group-hover:block w-56 p-3 bg-slate-800 text-white text-xs rounded-lg shadow-xl z-[9999] pointer-events-none transition-opacity">
        {text}
        <div className="absolute top-full right-[10px] border-[5px] border-transparent border-t-slate-800"></div>
      </div>
    </div>
  );
}

function ModuleCard({ title, tooltip, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold tracking-wide uppercase text-slate-700">{title}</h3>
        <Hint text={tooltip} />
      </div>
      <div className="flex-1 w-full h-full">
        {children}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// UPDATED: Authentic OEM Software Portfolio mapped to requested verticals
// -------------------------------------------------------------------------
const generateSoftwareData = () => {
  const apps = [
    { name: 'Salesforce CRM', vendor: 'Salesforce', vertical: 'Sales', purchased: 1200, active: 1050, costPerMonth: 150, renewalDays: 45 },
    { name: 'SAP S/4HANA', vendor: 'SAP', vertical: 'Finance', purchased: 800, active: 780, costPerMonth: 300, renewalDays: 210 },
    { name: 'Office 365', vendor: 'Microsoft', vertical: 'Corporate', purchased: 5000, active: 4800, costPerMonth: 25, renewalDays: 15 },
    { name: 'Siemens Teamcenter', vendor: 'Siemens', vertical: 'Manufacturing', purchased: 300, active: 180, costPerMonth: 200, renewalDays: 80 },
    { name: 'Workday', vendor: 'Workday', vertical: 'HR', purchased: 4500, active: 4400, costPerMonth: 45, renewalDays: 120 },
    { name: 'Oracle TMS', vendor: 'Oracle', vertical: 'Logistics', purchased: 400, active: 380, costPerMonth: 120, renewalDays: 60 },
    { name: 'Zendesk', vendor: 'Zendesk', vertical: 'Aftersales', purchased: 600, active: 450, costPerMonth: 89, renewalDays: 30 },
  ];

  const now = new Date();
  const currentMonth = now.getMonth() + 1;

  return apps.map(app => {
    const annualCost = app.purchased * app.costPerMonth * 12;
    const ytdSpend = app.purchased * app.costPerMonth * currentMonth;
    const wastedSeats = app.purchased - app.active;
    const wasteCost = wastedSeats * app.costPerMonth * 12;
    
    const renewalDate = new Date();
    renewalDate.setDate(now.getDate() + app.renewalDays);

    return { ...app, annualCost, ytdSpend, wastedSeats, wasteCost, renewalDate: renewalDate.toISOString().split('T')[0] };
  });
};

export default function LicensingAndSubs() {
  const dateRange = useGlobalStore((s) => s.dateRange);

  const { kpis, apps, budgetTrend } = useMemo(() => {
    const portfolio = generateSoftwareData();

    const totalYtdSpend = portfolio.reduce((sum, app) => sum + app.ytdSpend, 0);
    const totalPurchased = portfolio.reduce((sum, app) => sum + app.purchased, 0);
    const totalActive = portfolio.reduce((sum, app) => sum + app.active, 0);
    const utilizationRate = totalPurchased > 0 ? (totalActive / totalPurchased) * 100 : 0;
    const exposure90 = portfolio.filter(app => app.renewalDays <= 90).reduce((sum, app) => sum + app.annualCost, 0);
    const shelfwareWaste = portfolio.reduce((sum, app) => sum + app.wasteCost, 0);

    const trend = Array.from({ length: 12 }, (_, i) => {
      const monthSpend = 850000 + (Math.random() * 50000);
      return {
        month: new Date(2026, i, 1).toLocaleString('default', { month: 'short' }),
        actual: i <= new Date().getMonth() ? monthSpend : null,
        budget: 900000
      };
    });

    return {
      kpis: { totalYtdSpend, utilizationRate, exposure90, shelfwareWaste },
      apps: portfolio.sort((a, b) => b.annualCost - a.annualCost),
      budgetTrend: trend
    };
  }, [dateRange]);

  const fmtCur = (val) => `$${(val / 1000000).toFixed(2)}M`;

  return (
    <div className="space-y-6 pb-10">
      
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Software Spend (YTD)" value={fmtCur(kpis.totalYtdSpend)} tooltip="Cumulative spend year-to-date." icon={<CreditCard size={20} />} />
        <KpiCard title="License Utilization Rate" value={`${kpis.utilizationRate.toFixed(1)}%`} tooltip="Percentage of paid licenses actively used." icon={<Users size={20} />} />
        <KpiCard title="90-Day Renewal Exposure" value={fmtCur(kpis.exposure90)} tooltip="Total financial commitment for software contracts expiring in the next 90 days." icon={<CalendarClock size={20} />} />
        <KpiCard title="Estimated Shelfware Waste" value={fmtCur(kpis.shelfwareWaste)} tooltip="Annualized financial cost of unused seats." icon={<Trash2 size={20} />} />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        <ModuleCard title="Subscription Spend by Software" tooltip="Top applications consuming the IT software budget (Annualized).">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={apps} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis type="number" tickFormatter={(val) => `$${val/1000}k`} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11, fill: '#475569', fontWeight: 500 }} axisLine={false} tickLine={false} />
                <ChartTooltip formatter={(val) => `$${val.toLocaleString()}`} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="annualCost" name="Annual Cost" fill="#0284c7" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ModuleCard>

        <ModuleCard title="Spend vs. Budget Trend" tooltip="Actual cumulative software spend against forecasted IT budget.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={budgetTrend} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(val) => `$${val/1000}k`} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <ChartTooltip formatter={(val) => `$${val.toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Line type="monotone" dataKey="actual" name="Actual Spend" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 4 }} />
                <Line type="stepAfter" dataKey="budget" name="Budget Allocated" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ModuleCard>

        <ModuleCard title="License Usage Distribution" tooltip="Active vs Inactive seats per application highlighting software waste.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={apps} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} interval={0} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <ChartTooltip cursor={{ fill: '#f1f5f9' }} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar dataKey="active" name="Active Seats" stackId="a" fill="#10b981" barSize={35} />
                <Bar dataKey="wastedSeats" name="Inactive Seats" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ModuleCard>

        <ModuleCard title="Upcoming Renewals Exposure" tooltip="Chronological list of expiring contracts. Red indicates <30 days to renew. Yellow indicates <90 days.">
          <div className="h-72 flex flex-col gap-5 overflow-y-auto pr-2">
            {[...apps].sort((a, b) => a.renewalDays - b.renewalDays).map((app) => {
              const isUrgent = app.renewalDays <= 30;
              const isWarning = app.renewalDays <= 90 && app.renewalDays > 30;
              const colorClass = isUrgent ? 'bg-red-500' : isWarning ? 'bg-amber-400' : 'bg-emerald-500';
              const textClass = isUrgent ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-emerald-600';
              
              const maxDays = 365;
              const progressPct = Math.max(5, 100 - (app.renewalDays / maxDays) * 100);

              return (
                <div key={app.name} className="flex flex-col gap-1.5 shrink-0">
                  <div className="flex justify-between items-end">
                    <span className="text-sm font-bold text-slate-800 leading-none">{app.name}</span>
                    <span className="text-sm font-bold text-slate-700 leading-none">${app.annualCost.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                      <div className={`h-full rounded-full transition-all ${colorClass}`} style={{ width: `${progressPct}%` }}></div>
                    </div>
                    <div className={`text-xs font-bold w-16 text-right ${textClass}`}>
                      {app.renewalDays} Days
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ModuleCard>
      </div>

      {/* Subscription Management Tracker Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center">
          <h3 className="text-sm font-bold tracking-wide uppercase text-slate-700">Subscription Management Tracker</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3 font-semibold">Application</th>
                <th className="px-5 py-3 font-semibold">Vendor</th>
                <th className="px-5 py-3 font-semibold">Department</th>
                <th className="px-5 py-3 font-semibold text-right">Purchased</th>
                <th className="px-5 py-3 font-semibold text-right">Active</th>
                <th className="px-5 py-3 font-semibold text-right">Monthly Cost</th>
                <th className="px-5 py-3 font-semibold">Renewal Date</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app, idx) => (
                <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-900">{app.name}</td>
                  <td className="px-5 py-3">{app.vendor}</td>
                  <td className="px-5 py-3 font-medium text-slate-700">{app.vertical}</td>
                  <td className="px-5 py-3 text-right">{app.purchased.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right text-emerald-600 font-medium">{app.active.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right">${app.costPerMonth.toLocaleString()}/lic</td>
                  <td className="px-5 py-3 font-medium text-slate-700">{app.renewalDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}