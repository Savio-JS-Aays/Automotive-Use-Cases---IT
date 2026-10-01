import { useEffect, useMemo, useState } from 'react';
import { 
  Activity, HelpCircle, Ticket, Timer, XOctagon 
} from 'lucide-react';
import { 
  Area, AreaChart, CartesianGrid, ResponsiveContainer, 
  Tooltip as ChartTooltip, XAxis, YAxis, BarChart, Bar,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { fetchAllRows } from '../lib/fetchAllRows';
import { DAY_MS, lastNDayKeys, rangeToDays, toDayKey } from '../lib/dateUtils';
import { useGlobalStore } from '../store/useGlobalStore';
import KpiCard from '../components/KpiCard';

const MINUTES_PER_DAY = 1440;
const TREND_DAYS = 30;

// -------------------------------------------------------------------------
// Maps raw database IDs to authentic OEM Software for clear chart labels
// -------------------------------------------------------------------------
const getOemAppDetails = (appId) => {
  const oemApps = [
    'SAP S/4HANA', 'Salesforce CRM', 'Siemens Teamcenter', 
    'Oracle TMS', 'Workday HRIS', 'Dealer Portal', 
    'Xentry Diagnostics', 'Service Hub'
  ];
  let hash = 0;
  for (let i = 0; i < appId.length; i++) hash = appId.charCodeAt(i) + ((hash << 5) - hash);
  const index = Math.abs(hash) % oemApps.length;
  return { name: oemApps[index] };
};

// -------------------------------------------------------------------------
// Custom tooltip & wrapper to ensure hover states are never clipped
// -------------------------------------------------------------------------
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

const DEPT_COLORS = ['#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981', '#64748b', '#ec4899'];

export default function ExecutiveOverview() {
  const dateRange = useGlobalStore((s) => s.dateRange);
  const regionId = useGlobalStore((s) => s.regionId);

  const [apps, setApps] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [appRows, metricRows, incidentRows] = await Promise.all([
          fetchAllRows('dim_application', '*', { filter: (q) => q.eq('tier', 1) }),
          fetchAllRows('fact_app_metrics', '*, dim_application!inner(application_id, tier)', { filter: (q) => q.eq('dim_application.tier', 1) }),
          fetchAllRows('fact_incidents', '*', { orderBy: 'date_id' }),
        ]);
        if (cancelled) return;
        setApps(appRows);
        setMetrics(metricRows);
        setIncidents(incidentRows);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const inRegion = (rowRegion) => regionId === 'All' || !rowRegion || rowRegion === regionId;

  const { kpis, trendData, deptTicketData, appHealthData, appFailureData } = useMemo(() => {
    const days = rangeToDays(dateRange);
    const now = Date.now();
    const windowStart = now - days * DAY_MS;

    // --- Base Filtered Data ---
    const validMetrics = metrics.filter((m) => inRegion(m.dim_application?.region_id) && new Date(m.date_id).getTime() >= windowStart);
    const validIncidents = incidents.filter((i) => inRegion(i.affected_business_unit) && new Date(i.open_time || i.date_id).getTime() >= windowStart);

    // --- 1. Top Row KPIs ---
    let healthScore = null;
    if (validMetrics.length > 0) {
      const totalScore = validMetrics.reduce((sum, m) => {
        const mins = m.uptime_minutes || 0;
        return sum + Math.min(100, (mins / MINUTES_PER_DAY) * 100);
      }, 0);
      healthScore = totalScore / validMetrics.length;
    }

    const totalTickets = validIncidents.length;
    
    const resolvedIncidents = validIncidents.filter(i => i.resolution_time);
    const mttrHours = resolvedIncidents.length > 0 
      ? resolvedIncidents.reduce((sum, i) => sum + (new Date(i.resolution_time).getTime() - new Date(i.open_time || i.date_id).getTime()), 0) / resolvedIncidents.length / (1000 * 60 * 60) 
      : null;

    const failedTxVolume = validMetrics.reduce((sum, m) => sum + (m.failed_transactions || 0), 0);

    // --- 2. Disruption Trend (Line Chart) ---
    const keys = lastNDayKeys(TREND_DAYS);
    const trendCounts = Object.fromEntries(keys.map((k) => [k, 0]));
    incidents
      .filter((i) => (i.priority === 1 || i.priority === 2) && inRegion(i.affected_business_unit))
      .forEach((i) => {
        const key = toDayKey(i.open_time || i.date_id);
        if (key in trendCounts) trendCounts[key] += 1;
      });
    const trendData = keys.map((k) => ({ date: k.slice(5), incidents: trendCounts[k] }));

    // --- 3. Incident Distribution by Department (Donut Chart) ---
    const deptTicketMap = {};
    validIncidents.forEach(i => {
      const dept = i.affected_business_unit || 'Corporate';
      deptTicketMap[dept] = (deptTicketMap[dept] || 0) + 1;
    });
    const deptTicketData = Object.keys(deptTicketMap)
      .map((k, i) => ({ name: k, value: deptTicketMap[k], fill: DEPT_COLORS[i % DEPT_COLORS.length] }))
      .sort((a, b) => b.value - a.value);

    // --- 4. Application Uptime Leaderboard (Bar Chart) ---
    const appHealthMap = {};
    validMetrics.forEach(m => {
      const appName = getOemAppDetails(m.application_id).name;
      if (!appHealthMap[appName]) appHealthMap[appName] = { name: appName, uptimeSum: 0, count: 0 };
      appHealthMap[appName].uptimeSum += m.uptime_minutes || 0;
      appHealthMap[appName].count += 1;
    });
    const appHealthData = Object.values(appHealthMap)
      .map(a => ({
        name: a.name,
        uptime: Math.min(100, (a.uptimeSum / (a.count * MINUTES_PER_DAY)) * 100)
      }))
      .sort((a, b) => a.uptime - b.uptime) // Sort lowest uptime first
      .slice(0, 5); // Top 5 worst performers

    // --- 5. Failed Transaction Hotspots (Bar Chart) ---
    const appFailureMap = {};
    validMetrics.forEach(m => {
      const appName = getOemAppDetails(m.application_id).name;
      appFailureMap[appName] = (appFailureMap[appName] || 0) + (m.failed_transactions || 0);
    });
    const appFailureData = Object.keys(appFailureMap)
      .map(k => ({ name: k, failures: appFailureMap[k] }))
      .sort((a, b) => b.failures - a.failures) // Sort highest failures first
      .slice(0, 5); // Top 5 highest failure apps

    return { 
      kpis: { healthScore, totalTickets, mttrHours, failedTxVolume },
      trendData, deptTicketData, appHealthData, appFailureData
    };
  }, [apps, metrics, incidents, dateRange, regionId]);

  if (error) {
    return <div className="bg-white rounded-xl border border-red-200 p-4 text-sm text-red-700">Error: {error}</div>;
  }

  const fmt = (value, suffix = '') => (loading ? '…' : value === null ? '—' : `${value}${suffix}`);

  return (
    <div className="space-y-6 pb-10">
      
      {/* Top 4 Global KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Global IT Health Score" value={fmt(kpis.healthScore === null ? null : kpis.healthScore.toFixed(2), '%')} tooltip="Percentage of uptime across all mission-critical Tier-1 systems." icon={<Activity size={20} />} />
        <KpiCard title="Total Support Tickets" value={fmt(kpis.totalTickets)} tooltip="Total volume of IT incidents reported across all business units in the selected period." icon={<Ticket size={20} />} />
        <KpiCard title="Global MTTR" value={kpis.mttrHours === null ? '—' : `${kpis.mttrHours.toFixed(1)} hrs`} tooltip="Mean Time To Resolution: The average time taken by IT to fully resolve business outages." icon={<Timer size={20} />} />
        <KpiCard title="Failed Transactions" value={kpis.failedTxVolume === null ? '—' : kpis.failedTxVolume.toLocaleString()} tooltip="Total volume of failed digital transactions and API calls across all monitored systems." icon={<XOctagon size={20} />} />
      </div>

      {/* Visualizations 2x2 Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Existing: Disruption Trend */}
        <ModuleCard title="Disruption Trend (30 Days)" tooltip="Timeline showing the volume of high-priority (P1/P2) IT outages over the last 30 days.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="incidentFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0284c7" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#0284c7" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <ChartTooltip cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                <Area type="monotone" dataKey="incidents" name="P1/P2 Incidents" stroke="#0284c7" strokeWidth={2.5} fill="url(#incidentFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ModuleCard>

        {/* New 1: Incident Distribution by Department */}
        <ModuleCard title="Incident Distribution by Department" tooltip="Visualizes which business units are suffering the highest volume of IT outages and support tickets.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  data={deptTicketData} 
                  innerRadius={70} 
                  outerRadius={100} 
                  paddingAngle={5} 
                  dataKey="value" 
                  label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`} 
                  labelLine={false}
                >
                  {deptTicketData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                </Pie>
                <ChartTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ModuleCard>

        {/* New 2: Application Uptime Leaderboard */}
        <ModuleCard title="IT Modules: Lowest Uptime (%)" tooltip="Identifies the most unstable IT applications based on their average uptime percentage.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={appHealthData} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                {/* Domain set to 90-100 so small drops in uptime are visually clear */}
                <XAxis type="number" domain={[90, 100]} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11, fill: '#475569', fontWeight: 500 }} axisLine={false} tickLine={false} />
                <ChartTooltip formatter={(val) => `${val.toFixed(2)}%`} cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                <Bar dataKey="uptime" name="Uptime" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ModuleCard>

        {/* New 3: Failed Transaction Hotspots */}
        <ModuleCard title="IT Modules: Highest Failure Rates" tooltip="Highlights which IT applications are dropping the most data via failed transactions and API requests.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={appFailureData} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis type="number" tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(0)}k` : val} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11, fill: '#475569', fontWeight: 500 }} axisLine={false} tickLine={false} />
                <ChartTooltip formatter={(val) => val.toLocaleString()} cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                <Bar dataKey="failures" name="Failed Transactions" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ModuleCard>

      </div>
    </div>
  );
}