import { useMemo, useState } from 'react';
import { Gauge, ShieldAlert, MonitorCheck, ServerCrash, HelpCircle, Server, Smartphone, Users, Database, ArrowDown, Activity, AlertOctagon } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, BarChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { DAY_MS, lastNDayKeys, rangeToDays, toDayKey } from '../lib/dateUtils';
import { PORTAL_APP_ID, DEALER_PORTAL_APP_ID, XENTRY_APP_ID, SAP_CORE_APP_ID, CRM_APP_ID } from '../config';
import { useGlobalStore } from '../store/useGlobalStore';
import { useRawTables } from '../hooks/useRawTables';
import KpiCard from '../components/KpiCard';
import ChartCard from '../components/ChartCard';
import Tooltip from '../components/ToolTip';

const SPECS = {
  apps: { table: 'dim_application', options: { orderBy: 'application_id' } },
  metrics: {
    table: 'fact_app_metrics',
    select: '*, dim_application!inner(application_id, tier, application_name)',
    options: { orderBy: 'date_id' },
  },
  sales: { table: 'fact_sales_transaction', options: { orderBy: 'sale_id' } },
};

export default function AppReliability() {
  const dateRange = useGlobalStore((s) => s.dateRange);
  const regionId = useGlobalStore((s) => s.regionId);
  const { data, loading, error } = useRawTables(SPECS);

  // Local state for charting specific apps
  const [selectedAppFilter, setSelectedAppFilter] = useState('ALL');

  const { kpis, chartData, nodeHealth, availableApps } = useMemo(() => {
    const { apps = [], metrics = [], sales = [] } = data;
    const days = rangeToDays(dateRange);
    const windowStart = Date.now() - days * DAY_MS;
    
    // Safely check region. Treat as global if no region is defined.
    const inRegion = (r) => regionId === 'All' || !r || r === regionId;
    const inWindow = (value) => new Date(value).getTime() >= windowStart;

    const coreIds = new Set(apps.filter((a) => a.tier === 1).map((a) => a.application_id));
    const scopedMetrics = metrics.filter((m) => inWindow(m.date_id) && inRegion(m.dim_application?.region_id));

    // --- 1. Top-Level KPIs (Infrastructure-Wide Global Metrics) ---
    
    // KPI 1: Global Tier-1 Uptime
    const tier1Metrics = scopedMetrics.filter(m => coreIds.has(m.application_id));
    const globalUptimeSum = tier1Metrics.reduce((s, m) => s + (m.uptime_minutes || 0), 0);
    const globalExpectedMins = tier1Metrics.length > 0 ? tier1Metrics.length * 1440 : 1440; 
    const globalUptime = tier1Metrics.length ? Math.min(100, (globalUptimeSum / globalExpectedMins) * 100) : null;

    // KPI 2: Global Transaction Error Rate
    const globalFailed = scopedMetrics.reduce((s, m) => s + (m.failed_transactions || 0), 0);
    const globalTotalTx = scopedMetrics.reduce((s, m) => s + (m.total_transactions || 0), 0);
    const globalErrorRate = globalTotalTx > 0 ? (globalFailed / globalTotalTx) * 100 : null;

    // KPI 3: Global API Reliability (Success Rate)
    const globalSuccessApi = scopedMetrics.reduce((s, m) => s + (m.api_successes || 0), 0);
    const globalTotalApi = scopedMetrics.reduce((s, m) => s + (m.api_requests || 0), 0);
    const globalApiReliability = globalTotalApi > 0 ? Math.min(100, (globalSuccessApi / globalTotalApi) * 100) : null;

    // KPI 4: Average API Latency (Core Apps)
    const coreLatency = scopedMetrics.filter((m) => coreIds.has(m.application_id) && m.avg_api_latency_ms != null).map((m) => m.avg_api_latency_ms);
    const avgLatency = coreLatency.length ? coreLatency.reduce((a, b) => a + b, 0) / coreLatency.length : null;

    // --- 2. Chart Data Generation (Respects Local Filter) ---
    const chartMetrics = selectedAppFilter === 'ALL' 
      ? scopedMetrics 
      : scopedMetrics.filter(m => m.application_id === selectedAppFilter);

    const keys = lastNDayKeys(days);
    const salesByDay = Object.fromEntries(keys.map((k) => [k, 0]));
    
    // Process Sales (Context metric)
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

    // --- 3. Dependency Graph Health (Ignores local filter, uses global scoped) ---
    const calculateNodeHealth = (appId) => {
      const m = scopedMetrics.filter((m) => m.application_id === appId);
      if (!m.length) return { status: 'Healthy', color: 'bg-emerald-500', glow: '', border: 'border-slate-200' };
      
      const avgLat = m.reduce((s, val) => s + (val.avg_api_latency_ms || 0), 0) / m.length;
      const errs = m.reduce((s, val) => s + (val.failed_transactions || 0), 0);
      
      if (errs > 50 || avgLat > 800) return { status: 'Down', color: 'bg-red-500', glow: 'animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]', border: 'border-red-500 bg-red-50 text-red-900' };
      if (errs > 10 || avgLat > 300) return { status: 'Degraded', color: 'bg-amber-400', glow: 'shadow-[0_0_15px_rgba(251,191,36,0.3)]', border: 'border-amber-400 bg-amber-50 text-amber-900' };
      return { status: 'Healthy', color: 'bg-emerald-500', glow: '', border: 'border-slate-200 bg-white text-slate-700' };
    };

    // Filter list for the dropdown
    const availableApps = Array.from(new Set(scopedMetrics.map(m => JSON.stringify({ id: m.application_id, name: m.dim_application?.application_name })))).map(JSON.parse);

    return { 
      kpis: { globalUptime, globalErrorRate, globalApiReliability, avgLatency }, 
      chartData,
      availableApps,
      nodeHealth: {
        dealer: calculateNodeHealth(DEALER_PORTAL_APP_ID),
        customer: calculateNodeHealth(PORTAL_APP_ID),
        xentry: calculateNodeHealth(XENTRY_APP_ID),
        crm: calculateNodeHealth(CRM_APP_ID),
        sap: calculateNodeHealth(SAP_CORE_APP_ID)
      }
    };
  }, [data, dateRange, regionId, selectedAppFilter]);

  if (error) {
    return <div className="bg-white rounded-xl border border-red-200 p-4 text-sm text-red-700">Error: {error}</div>;
  }

  const show = (v, fmt) => (loading ? '…' : v === null ? '—' : fmt(v));

  return (
    <div className="space-y-6">
      {/* Top Level KPIs (Global Infrastructure) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard 
          title="Global Tier-1 Uptime" 
          value={show(kpis.globalUptime, (v) => `${v.toFixed(2)}%`)} 
          tooltip="Average uptime percentage across all mission-critical Tier-1 infrastructure." 
          icon={<MonitorCheck size={20} />} 
        />
        <KpiCard 
          title="Global Error Rate" 
          value={show(kpis.globalErrorRate, (v) => `${v.toFixed(2)}%`)} 
          tooltip="Overall percentage of failed transactions across the entire monitored IT portfolio." 
          icon={<AlertOctagon size={20} />} 
        />
        <KpiCard 
          title="Global API Reliability" 
          value={show(kpis.globalApiReliability, (v) => `${v.toFixed(2)}%`)} 
          tooltip="Overall success rate of API requests fleet-wide." 
          icon={<Activity size={20} />} 
        />
        <KpiCard 
          title="Average API Latency" 
          value={show(kpis.avgLatency, (v) => `${v.toFixed(0)} ms`)} 
          tooltip="Average data transfer speed to the core backend across all Tier-1 systems." 
          icon={<Gauge size={20} />} 
        />
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
          className="bg-slate-50 border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-sky-500 focus:border-sky-500 block px-3 py-1.5 outline-none font-medium"
        >
          <option value="ALL">All Core Applications</option>
          {availableApps.map(app => (
            <option key={app.id} value={app.id}>{app.name || app.id}</option>
          ))}
        </select>
      </div>

      {/* Visualizations Grid (4 Components) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Chart 1: App Health vs Business Volume */}
        <ChartCard title="Health vs. Volume Context" tooltip="Correlates latency against sales to identify revenue impact.">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" unit="ms" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <ChartTooltip />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }}/>
                <Bar yAxisId="left" dataKey="sales" name="Vehicles Sold" fill="#bae6fd" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="latency" name="Latency (ms)" stroke="#0369a1" strokeWidth={2} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Chart 2: Error Rate Trend */}
        <ChartCard title="Error Rate Trend" tooltip="Daily percentage of failed transactions for the selected application context.">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis unit="%" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <ChartTooltip />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }}/>
                <Line type="monotone" dataKey="errorRate" name="Error Rate (%)" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: '#ef4444' }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Chart 3: API Request Volume */}
        <ChartCard title="API Request Volume" tooltip="Total volume of API calls vs successful executions.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <ChartTooltip cursor={{ fill: '#f1f5f9' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }}/>
                <Bar dataKey="apiRequests" name="Total Requests" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="apiSuccess" name="Successful Requests" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Chart 4: Enhanced Dependency Graph */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold tracking-wide uppercase text-slate-500">System Topology Map</h3>
            <Tooltip content="Live architectural map showing upstream/downstream reliance."><button className="focus:outline-none"><HelpCircle size={16} className="text-slate-400" /></button></Tooltip>
          </div>
          
          <div className="flex-1 flex flex-col items-center justify-between bg-slate-50 rounded-xl p-6 border border-slate-100 relative">
            
            {/* Edge Layer */}
            <div className="w-full flex justify-between px-2 relative z-10">
              <TopologyNode title="Dealer B2B" icon={MonitorCheck} data={nodeHealth.dealer} />
              <TopologyNode title="Customer App" icon={Smartphone} data={nodeHealth.customer} />
              <TopologyNode title="Xentry Field" icon={Users} data={nodeHealth.xentry} />
            </div>

            {/* Downward Flow Arrows */}
            <div className="flex w-full justify-around text-slate-300 my-2"><ArrowDown size={20}/><ArrowDown size={20}/><ArrowDown size={20}/></div>

            {/* Middleware Layer */}
            <div className="w-full flex justify-center relative z-10">
              <TopologyNode title="Salesforce CRM API" icon={Server} data={nodeHealth.crm} isWide />
            </div>

            {/* Downward Flow Arrow */}
            <div className="flex w-full justify-center text-slate-300 my-2"><ArrowDown size={20}/></div>

            {/* Core Layer */}
            <div className="w-full flex justify-center relative z-10">
              <TopologyNode title="SAP Core ERP Engine" icon={Database} data={nodeHealth.sap} isCore />
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}

// Sub-component for Enhanced Topology Nodes
function TopologyNode({ title, icon: Icon, data, isWide, isCore }) {
  if (!data) return null;
  return (
    <div className={`flex flex-col items-center p-3 rounded-xl border-2 shadow-sm transition-all duration-500 ${data.border} ${data.glow} ${isWide ? 'w-2/3' : 'w-[30%]'} ${isCore ? 'w-5/6 py-5 border-b-4' : ''}`}>
      <Icon size={isCore ? 28 : 20} className={`mb-2 ${data.status === 'Healthy' ? 'text-emerald-600' : 'text-inherit'}`} />
      <span className={`font-bold tracking-tight text-center ${isCore ? 'text-base' : 'text-xs'}`}>{title}</span>
      <div className="mt-2 flex items-center gap-1.5 bg-white/80 px-2 py-0.5 rounded-full border border-black/5">
        <span className={`w-2 h-2 rounded-full ${data.color}`}></span>
        <span className="text-[10px] uppercase font-bold text-slate-700">{data.status}</span>
      </div>
    </div>
  );
}