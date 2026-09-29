import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CalendarCheck, DollarSign, HelpCircle, LayoutGrid } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { fetchAllRows } from '../lib/fetchAllRows';
import { DAY_MS, lastNDayKeys, rangeToDays, toDayKey } from '../lib/dateUtils';
import { useGlobalStore } from '../store/useGlobalStore';
import KpiCard from '../components/KpiCard';
import Tooltip from '../components/ToolTip';

const MINUTES_PER_DAY = 1440;
const TREND_DAYS = 30;

const COST_PER_MINUTE = {
  'Manufacturing': 15000,
  'Logistics': 8000,
  'Sales': 5000,
  'Aftersales': 3000,
  'Corporate': 1000,
};
const DEFAULT_COST = 2000;

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

  const kpis = useMemo(() => {
    const days = rangeToDays(dateRange);
    const now = Date.now();
    const windowStart = now - days * DAY_MS;

    // 1. Global IT Health Score (Normalized)
    const validMetrics = metrics.filter((m) => inRegion(m.dim_application?.region_id) && new Date(m.date_id).getTime() >= windowStart);
    let healthScore = null;
    if (validMetrics.length > 0) {
      // Calculate individual row percentages capped at 100%, then average them to prevent anomalous mock data from exceeding 100%
      const totalScore = validMetrics.reduce((sum, m) => {
        const mins = m.uptime_minutes || 0;
        const pct = Math.min(100, (mins / MINUTES_PER_DAY) * 100);
        return sum + pct;
      }, 0);
      healthScore = totalScore / validMetrics.length;
    }

    // 2. Active Business Disruptions (Filtered by Date Range)
    const validIncidents = incidents.filter((i) => inRegion(i.affected_business_unit) && new Date(i.open_time || i.date_id).getTime() >= windowStart);
    const p1 = validIncidents.filter((i) => i.priority === 1);
    const activeP1 = p1.filter((i) => i.status === 'Active');
    const activeDisruptions = activeP1.length;

    // 3. Financial Impact of IT Downtime (Bounded)
    let financialImpact = 0;
    activeP1.forEach((incident) => {
      const costPerMin = COST_PER_MINUTE[incident.affected_business_unit] || DEFAULT_COST;
      const openTime = new Date(incident.open_time || incident.date_id).getTime();
      // Bound the downtime to a max of 48 hours (2880 mins) to prevent ancient mock dates from generating billions
      const minutesDown = Math.min(2880, Math.max(0, Math.floor((now - openTime) / 60000)));
      financialImpact += minutesDown * costPerMin;
    });

    // 4. Zero-Disruption Days
    const latestResolution = p1
      .filter((i) => i.resolution_time)
      .reduce((max, i) => Math.max(max, new Date(i.resolution_time).getTime()), 0);
    const zeroDays = activeDisruptions > 0 ? 0 : latestResolution ? Math.floor((now - latestResolution) / DAY_MS) : null;

    // 5. Digital Value Chain Matrix
    const verticals = {};
    apps.forEach((app) => {
      const v = app.business_vertical || 'Corporate';
      if (!verticals[v]) verticals[v] = { down: false, degraded: false };
    });
    activeP1.forEach((incident) => {
      const v = incident.affected_business_unit;
      if (verticals[v]) verticals[v].down = true;
    });
    validIncidents
      .filter((i) => i.priority === 2 && i.status === 'Active')
      .forEach((incident) => {
        const v = incident.affected_business_unit;
        if (verticals[v] && !verticals[v].down) verticals[v].degraded = true;
      });

    const valueChain = Object.keys(verticals).length > 0 
      ? Object.entries(verticals).map(([name, status]) => ({
          name,
          state: status.down ? '🔴 Down' : status.degraded ? '🟡 Degraded' : '🟢 Healthy',
          color: status.down ? 'bg-red-500' : status.degraded ? 'bg-amber-400' : 'bg-emerald-500',
          textColor: status.down ? 'text-red-700' : status.degraded ? 'text-amber-700' : 'text-emerald-700',
          bgColor: status.down ? 'bg-red-50' : status.degraded ? 'bg-amber-50' : 'bg-emerald-50'
        }))
      : [];

    return { healthScore, activeDisruptions, financialImpact, zeroDays, valueChain };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps, metrics, incidents, dateRange, regionId]);

  // 6. Disruption Trend
  const trend = useMemo(() => {
    const keys = lastNDayKeys(TREND_DAYS);
    const counts = Object.fromEntries(keys.map((k) => [k, 0]));
    incidents
      .filter((i) => (i.priority === 1 || i.priority === 2) && inRegion(i.affected_business_unit))
      .forEach((i) => {
        const key = toDayKey(i.open_time || i.date_id);
        if (key in counts) counts[key] += 1;
      });
    return keys.map((k) => ({ date: k.slice(5), incidents: counts[k] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidents, regionId]);

  if (error) {
    return <div className="bg-white rounded-xl border border-red-200 p-4 text-sm text-red-700">Error: {error}</div>;
  }

  const fmt = (value, suffix = '') => (loading ? '…' : value === null ? '—' : `${value}${suffix}`);
  const fmtCurrency = (val) => {
    if (loading) return '…';
    if (val === null || val === 0) return '$0';
    if (val >= 1000000) return `$${(val / 1000000).toFixed(2)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`;
    return `$${val}`;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Global IT Health Score" value={fmt(kpis.healthScore === null ? null : kpis.healthScore.toFixed(2), '%')} tooltip="Percentage of uptime across mission-critical Tier-1 systems." icon={<Activity size={20} />} />
        <KpiCard title="Active Business Disruptions" value={fmt(kpis.activeDisruptions)} tooltip="Real-time count of Priority 1 IT incidents actively halting core business processes." icon={<AlertTriangle size={20} />} />
        <KpiCard title="Financial Impact of IT Downtime" value={fmtCurrency(kpis.financialImpact)} tooltip="Estimated revenue lost or cost incurred due to active IT outages." icon={<DollarSign size={20} />} />
        <KpiCard title="Zero-Disruption Days" value={fmt(kpis.zeroDays)} tooltip="Consecutive days since the last Priority 1 business-impacting IT outage." icon={<CalendarCheck size={20} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold tracking-wide uppercase text-slate-500">Disruption Trend (30 Days)</h3>
            <Tooltip content="Timeline showing the volume of business-impacting IT outages over the last 30 days."><button className="focus:outline-none"><HelpCircle size={16} className="text-slate-400" /></button></Tooltip>
          </div>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs><linearGradient id="incidentFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0284c7" stopOpacity={0.3} /><stop offset="100%" stopColor="#0284c7" stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <ChartTooltip />
                <Area type="monotone" dataKey="incidents" stroke="#0284c7" strokeWidth={2} fill="url(#incidentFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold tracking-wide uppercase text-slate-500">Value Chain Matrix</h3>
            <Tooltip content="High-level traffic light view of critical IT systems grouped by the 5 business verticals."><button className="focus:outline-none"><HelpCircle size={16} className="text-slate-400" /></button></Tooltip>
          </div>
          <div className="flex flex-col gap-3 overflow-y-auto max-h-64 pr-2">
            {kpis.valueChain.map((vertical) => (
              <div key={vertical.name} className={`flex items-center justify-between p-3 rounded-lg border border-slate-100 ${vertical.bgColor}`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full bg-white shadow-sm text-slate-400`}><LayoutGrid size={16} /></div>
                  <span className="font-semibold text-slate-700 text-sm">{vertical.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${vertical.color}`}></span>
                  <span className={`text-xs font-bold uppercase tracking-wider ${vertical.textColor}`}>{vertical.state}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}