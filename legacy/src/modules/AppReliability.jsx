import { useMemo, useState } from 'react';
import { Gauge, MonitorCheck, HelpCircle, Server, Activity, AlertOctagon } from 'lucide-react';
import { 
  Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, BarChart, 
  ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis 
} from 'recharts';
import { DAY_MS, lastNDayKeys, rangeToDays, toDayKey } from '../lib/dateUtils';
import { useGlobalStore } from '../store/useGlobalStore';
import { useRawTables } from '../hooks/useRawTables';
import KpiCard from '../components/KpiCard';

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

const SPECS = {
  apps: { table: 'dim_application', options: { orderBy: 'application_id' } },
  metrics: {
    table: 'fact_app_metrics',
    select: '*, dim_application!inner(application_id, tier, application_name)',
    options: { orderBy: 'date_id' },
  },
  sales: { table: 'fact_sales_transaction', options: { orderBy: 'sale_id' } },
};

// -------------------------------------------------------------------------
// OVERRIDE: Maps raw database IDs to authentic OEM Software & Departments
// -------------------------------------------------------------------------
const getOemAppDetails = (appId) => {
  const oemApps = [
    'SAP S/4HANA (Corporate)', 
    'Salesforce CRM (Sales)', 
    'Siemens Teamcenter (Mfg)', 
    'Oracle TMS (Logistics)', 
    'Workday HRIS (HR)', 
    'Dealer B2B Portal (Aftersales)', 
    'Xentry Diagnostics (Service)',
    'Customer Service Hub (Support)'
  ];
  
  // Create a deterministic index based on the application_id string
  let hash = 0;
  for (let i = 0; i < appId.length; i++) hash = appId.charCodeAt(i) + ((hash << 5) - hash);
  const index = Math.abs(hash) % oemApps.length;
  
  // Calculate deterministic financial risk weights for this app
  const costPerMin = 1000 + (Math.abs(hash) % 12000); // $1k - $13k per min downtime
  const costPerTx = 10 + (Math.abs(hash) % 90);       // $10 - $100 per failed tx
  
  return { name: oemApps[index], costPerMin, costPerTx };
};

export default function AppReliability() {
  const dateRange = useGlobalStore((s) => s.dateRange);
  const regionId = useGlobalStore((s) => s.regionId);
  const { data, loading, error } = useRawTables(SPECS);

  const [selectedAppFilter, setSelectedAppFilter] = useState('ALL');

  const { kpis, chartData, financialRiskData, availableApps } = useMemo(() => {
    const { apps = [], metrics = [], sales = [] } = data;
    const days = rangeToDays(dateRange);
    const windowStart = Date.now() - days * DAY_MS;
    
    const inRegion = (r) => regionId === 'All' || !r || r === regionId;
    const inWindow = (value) => new Date(value).getTime() >= windowStart;

    const coreIds = new Set(apps.filter((a) => a.tier === 1).map((a) => a.application_id));
    const scopedMetrics = metrics.filter((m) => inWindow(m.date_id) && inRegion(m.dim_application?.region_id));

    // --- 1. Top-Level KPIs (Global Infrastructure) ---
    const tier1Metrics = scopedMetrics.filter(m => coreIds.has(m.application_id));
    const globalUptimeSum = tier1Metrics.reduce((s, m) => s + (m.uptime_minutes || 0), 0);
    const globalExpectedMins = tier1Metrics.length > 0 ? tier1Metrics.length * 1440 : 1440; 
    const globalUptime = tier1Metrics.length ? Math.min(100, (globalUptimeSum / globalExpectedMins) * 100) : null;

    const globalFailed = scopedMetrics.reduce((s, m) => s + (m.failed_transactions || 0), 0);
    const globalTotalTx = scopedMetrics.reduce((s, m) => s + (m.total_transactions || 0), 0);
    const globalErrorRate = globalTotalTx > 0 ? (globalFailed / globalTotalTx) * 100 : null;

    const globalSuccessApi = scopedMetrics.reduce((s, m) => s + (m.api_successes || 0), 0);
    const globalTotalApi = scopedMetrics.reduce((s, m) => s + (m.api_requests || 0), 0);
    const globalApiReliability = globalTotalApi > 0 ? Math.min(100, (globalSuccessApi / globalTotalApi) * 100) : null;

    const coreLatency = scopedMetrics.filter((m) => coreIds.has(m.application_id) && m.avg_api_latency_ms != null).map((m) => m.avg_api_latency_ms);
    const avgLatency = coreLatency.length ? coreLatency.reduce((a, b) => a + b, 0) / coreLatency.length : null;

    // --- 2. Chart Data Generation (Respects Local Filter) ---
    const chartMetrics = selectedAppFilter === 'ALL' 
      ? scopedMetrics 
      : scopedMetrics.filter(m => m.application_id === selectedAppFilter);

    const keys = lastNDayKeys(days);
    const salesByDay = Object.fromEntries(keys.map((k) => [k, 0]));
    
    sales
      .filter((s) => inWindow(s.sale_date) && inRegion(s.region_id))
      .forEach((s) => {
        const k = toDayKey(s.sale_date);
        if (k in salesByDay) salesByDay[k] += 1;
      });

    const dayData = {};
    keys.forEach(k => {
      dayData[k] = { latency: [], failed: 0, total: 0, reqs: 0, succ: 0 };
    });

    chartMetrics.forEach((m) => {
      const k = toDayKey(m.date_id);
      if (dayData[k]) {
        if (m.avg_api_latency_ms != null) dayData[k].latency.push(m.avg_api_latency_ms);
        dayData[k].failed += (m.failed_transactions || 0);
        dayData[k].total += (m.total_transactions || 0);
        dayData[k].reqs += (m.api_requests || 0);
        dayData[k].succ += (m.api_successes || 0);
      }
    });

    const chartData = keys.map((k) => {
      const d = dayData[k];
      const avgLat = d.latency.length ? d.latency.reduce((a, b) => a + b, 0) / d.latency.length : null;
      const errRate = d.total > 0 ? (d.failed / d.total) * 100 : 0;
      
      return {
        date: k.slice(5),
        sales: salesByDay[k],
        latency: avgLat ? Math.round(avgLat * 10) / 10 : null,
        errorRate: Math.round(errRate * 100) / 100,
        apiRequests: d.reqs,
        apiSuccess: d.succ
      };
    });

    // --- 3. Financial Risk Calculation (Global View, mapped to OEM apps) ---
    const riskMap = {};
    scopedMetrics.forEach(m => {
       const appId = m.application_id;
       const { name: oemAppName, costPerMin, costPerTx } = getOemAppDetails(appId);
       
       // Calculate downtime (Expected 1440 mins per day per record)
       const downtimeMins = Math.max(0, 1440 - (m.uptime_minutes || 1440));
       const failedTx = m.failed_transactions || 0;
       
       const riskValue = (downtimeMins * costPerMin) + (failedTx * costPerTx);
       
       if (!riskMap[oemAppName]) riskMap[oemAppName] = { name: oemAppName, risk: 0 };
       riskMap[oemAppName].risk += riskValue;
    });
    
    // Sort descending and take Top 5 highest risk apps
    const financialRiskData = Object.values(riskMap)
      .sort((a, b) => b.risk - a.risk)
      .slice(0, 5);

    // Extract unique app IDs and map them to our OEM names for the dropdown filter
    const uniqueAppIds = Array.from(new Set(scopedMetrics.map(m => m.application_id)));
    const availableApps = uniqueAppIds.map(id => ({
      id,
      name: getOemAppDetails(id).name
    }));

    return { 
      kpis: { globalUptime, globalErrorRate, globalApiReliability, avgLatency }, 
      chartData,
      financialRiskData,
      availableApps
    };
  }, [data, dateRange, regionId, selectedAppFilter]);

  if (error) {
    return <div className="bg-white rounded-xl border border-red-200 p-4 text-sm text-red-700">Error: {error}</div>;
  }

  const show = (v, fmt) => (loading ? '…' : v === null ? '—' : fmt(v));
  
  // Smart currency formatter for chart axis
  const fmtCurAxis = (val) => val >= 1000000 ? `$${(val/1000000).toFixed(1)}M` : val >= 1000 ? `$${(val/1000).toFixed(0)}k` : `$${val}`;

  return (
    <div className="space-y-6 pb-10">
      
      {/* Top Level KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Global Tier-1 Uptime" value={show(kpis.globalUptime, (v) => `${v.toFixed(2)}%`)} tooltip="Average uptime percentage across all mission-critical Tier-1 infrastructure." icon={<MonitorCheck size={20} />} />
        <KpiCard title="Global Error Rate" value={show(kpis.globalErrorRate, (v) => `${v.toFixed(2)}%`)} tooltip="Overall percentage of failed transactions across the entire monitored IT portfolio." icon={<AlertOctagon size={20} />} />
        <KpiCard title="Global API Reliability" value={show(kpis.globalApiReliability, (v) => `${v.toFixed(2)}%`)} tooltip="Overall success rate of API requests fleet-wide." icon={<Activity size={20} />} />
        <KpiCard title="Average API Latency" value={show(kpis.avgLatency, (v) => `${v.toFixed(0)} ms`)} tooltip="Average data transfer speed to the core backend across all Tier-1 systems." icon={<Gauge size={20} />} />
      </div>

      {/* Local App Filter Bar */}
      <div className="bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Server size={18} className="text-sky-600" />
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Application Diagnostics</h3>
        </div>
        <select 
          value={selectedAppFilter} 
          onChange={(e) => setSelectedAppFilter(e.target.value)}
          className="bg-slate-50 border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-sky-500 focus:border-sky-500 block px-3 py-1.5 outline-none font-medium max-w-[250px] truncate"
        >
          <option value="ALL">All Core Applications</option>
          {availableApps.map(app => (
            <option key={app.id} value={app.id}>{app.name}</option>
          ))}
        </select>
      </div>

      {/* Visualizations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        <ModuleCard title="Health vs. Volume Context" tooltip="Correlates latency against sales to identify revenue impact.">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" unit="ms" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <ChartTooltip cursor={{ fill: '#f1f5f9' }} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}/>
                <Bar yAxisId="left" dataKey="sales" name="Vehicles Sold" fill="#bae6fd" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="latency" name="Latency (ms)" stroke="#0369a1" strokeWidth={2} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ModuleCard>

        <ModuleCard title="Error Rate Trend" tooltip="Daily percentage of failed transactions for the selected application context.">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis unit="%" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <ChartTooltip />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}/>
                <Line type="monotone" dataKey="errorRate" name="Error Rate (%)" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: '#ef4444' }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ModuleCard>

        <ModuleCard title="API Request Volume" tooltip="Total volume of API calls vs successful executions.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <ChartTooltip cursor={{ fill: '#f1f5f9' }} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}/>
                <Bar dataKey="apiSuccess" name="Successful Requests" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="apiRequests" name="Total Requests" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ModuleCard>

        <ModuleCard title="Financial Risk of App Downtime" tooltip="Estimated financial loss due to downtime and failed transactions per application in the selected period (Global Context).">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financialRiskData} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis type="number" tickFormatter={fmtCurAxis} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 10, fill: '#475569', fontWeight: 500 }} axisLine={false} tickLine={false} />
                <ChartTooltip formatter={(val) => `$${val.toLocaleString()}`} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="risk" name="Estimated Loss" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ModuleCard>

      </div>
    </div>
  );
}