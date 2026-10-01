import { useMemo } from 'react';
import { GitPullRequestArrow, Timer, AlertTriangle, HelpCircle } from 'lucide-react';
import { 
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, 
  Tooltip as ChartTooltip, XAxis, YAxis, Legend, ScatterChart, Scatter, ZAxis 
} from 'recharts';
import { DAY_MS, lastNDayKeys, rangeToDays, toDayKey } from '../lib/dateUtils';
import { useGlobalStore } from '../store/useGlobalStore';
import { useRawTables } from '../hooks/useRawTables';
import KpiCard from '../components/KpiCard';
import ChartCard from '../components/ChartCard';
import Tooltip from '../components/ToolTip';

const HOUR_MS = 60 * 60 * 1000;

const SPECS = {
  deployments: { table: 'fact_deployments', options: { orderBy: 'date_id' } },
  incidents: { table: 'fact_incidents', options: { orderBy: 'date_id' } },
};

// Custom Dot for KPI 4 (Line Chart)
function DeploymentDot({ cx, cy, payload }) {
  if (cx == null || cy == null) return null;
  if (payload.deployments > 0) {
    return <circle cx={cx} cy={cy} r={6} fill="#f59e0b" stroke="#ffffff" strokeWidth={2} />;
  }
  return <circle cx={cx} cy={cy} r={3} fill="#0284c7" />;
}

// Custom Tooltip for KPI 4
function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const { incidents, deployments } = payload[0].payload;
  return (
    <div className="bg-slate-900 text-white rounded-lg shadow-xl p-3 text-xs border border-slate-700">
      <p className="font-bold mb-2 text-slate-300 border-b border-slate-700 pb-1">{label}</p>
      <div className="flex justify-between gap-4">
        <span className="text-slate-400">Incidents:</span>
        <span className="font-semibold text-sky-400">{incidents}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-slate-400">Deployments:</span>
        <span className="font-semibold text-amber-400">{deployments}</span>
      </div>
    </div>
  );
}

// Custom Detailed Node for KPI 6 (Scatter/Cluster Matrix)
function ImpactNode(props) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  
  const isChange = payload.cause === 'Change';
  const isP1 = payload.priority === 1;
  const fill = isChange ? '#f59e0b' : '#0284c7'; // Amber for Change, Sky for External
  const radius = isP1 ? 10 : 5;

  return (
    <g transform={`translate(${cx},${cy})`}>
      {/* Pulsing ring for P1 Critical Incidents */}
      {isP1 && (
        <circle r={radius + 6} fill={fill} opacity={0.2} className="animate-pulse" />
      )}
      {/* Core Node */}
      <circle 
        r={radius} 
        fill={fill} 
        fillOpacity={0.85}
        stroke="#ffffff" 
        strokeWidth={isP1 ? 2 : 1} 
        className="shadow-sm transition-transform hover:scale-125"
      />
    </g>
  );
}

// Custom Tooltip for KPI 6
function ClusterTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-slate-900 text-white rounded-lg shadow-xl p-3 text-xs border border-slate-700 min-w-[150px]">
      <p className="font-bold mb-2 text-slate-300 border-b border-slate-700 pb-1">
        {data.dateName} • {data.verticalName}
      </p>
      <div className="flex justify-between gap-4 mb-1">
        <span className="text-slate-400">Severity:</span>
        <span className={`font-semibold ${data.priority === 1 ? 'text-red-400' : 'text-amber-400'}`}>
          {data.priority === 1 ? 'P1 Critical' : 'P2 High'}
        </span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-slate-400">Root Cause:</span>
        <span className="font-semibold text-white">{data.cause}</span>
      </div>
    </div>
  );
}

const VERTICAL_COLORS = {
  'Manufacturing': '#0284c7', 
  'Logistics': '#10b981',     
  'Sales': '#8b5cf6',         
  'Aftersales': '#f59e0b',    
  'Corporate': '#64748b'      
};

export default function ChangeImpact() {
  const dateRange = useGlobalStore((s) => s.dateRange);
  const regionId = useGlobalStore((s) => s.regionId);
  const { data, loading, error } = useRawTables(SPECS);

  const { kpis, trendData, volumeData, clusterData, verticalsList, dateKeys } = useMemo(() => {
    const { deployments = [], incidents = [] } = data;
    const days = rangeToDays(dateRange);
    const windowStart = Date.now() - days * DAY_MS;
    const inRegion = (r) => regionId === 'All' || !r || r === regionId;

    const scopedIncidents = incidents.filter(
      (i) => new Date(i.date_id).getTime() >= windowStart && inRegion(i.region_id)
    );
    const scopedDeployments = deployments.filter(
      (d) => new Date(d.date_id).getTime() >= windowStart && inRegion(d.region_id)
    );

    // KPI 1: Change-Induced Outage Rate
    const changeCount = scopedIncidents.filter((i) => i.root_cause_type === 'Change').length;
    const changeRate = scopedIncidents.length > 0 ? (changeCount / scopedIncidents.length) * 100 : null;

    // KPI 2: Total Active P1/P2 Incidents
    const activeIncidentsCount = scopedIncidents.filter(
      (i) => (i.priority === 1 || i.priority === 2) && (i.status === 'Active' || i.status === 'Open')
    ).length;

    // KPI 3: MTTR for Business Incidents
    const resolved = scopedIncidents.filter((i) => (i.priority === 1 || i.priority === 2) && i.resolution_time);
    const mttrHours = resolved.length
      ? resolved.reduce((s, i) => s + (new Date(i.resolution_time) - new Date(i.open_time || i.date_id)), 0) / resolved.length / HOUR_MS
      : null;

    const keys = lastNDayKeys(days);
    const incidentsByDay = Object.fromEntries(keys.map((k) => [k, 0]));
    const deploysByDay = Object.fromEntries(keys.map((k) => [k, 0]));
    const volumeByDay = Object.fromEntries(keys.map((k) => [k, {}]));
    
    // Track unique verticals for the Matrix Grid
    const foundVerticals = new Set(['Manufacturing', 'Logistics', 'Sales', 'Aftersales', 'Corporate']);
    
    // Variables to handle micro-clustering (jitter) if multiple incidents land in the same grid cell
    const cellOccupancy = {};
    const clusterPrep = [];

    scopedIncidents.forEach((i) => {
      const k = toDayKey(i.date_id);
      if (k in incidentsByDay) {
        incidentsByDay[k] += 1;
        
        const v = i.affected_business_unit || 'Corporate';
        foundVerticals.add(v);
        volumeByDay[k][v] = (volumeByDay[k][v] || 0) + 1;
      }
    });

    const vList = Array.from(foundVerticals);

    // Build Cluster Data with Matrix Coordinates
    scopedIncidents.forEach((i) => {
      const k = toDayKey(i.date_id);
      if (k in incidentsByDay) {
        const v = i.affected_business_unit || 'Corporate';
        const xIndex = vList.indexOf(v);
        const yIndex = keys.indexOf(k);
        const cellKey = `${xIndex}-${yIndex}`;
        
        // Calculate a tiny radial jitter if there are overlapping incidents
        const occupantCount = cellOccupancy[cellKey] || 0;
        cellOccupancy[cellKey] = occupantCount + 1;
        
        const angle = occupantCount * (Math.PI / 2.5);
        const offsetRadius = occupantCount === 0 ? 0 : 0.15 + (occupantCount * 0.05);
        const xOffset = Math.cos(angle) * offsetRadius;
        const yOffset = Math.sin(angle) * offsetRadius;

        clusterPrep.push({
          x: xIndex + xOffset,
          y: yIndex + yOffset,
          z: i.priority === 1 ? 400 : 150, 
          verticalName: v,
          dateName: k.slice(5),
          priority: i.priority,
          cause: i.root_cause_type || 'External'
        });
      }
    });

    scopedDeployments.forEach((d) => {
      const k = toDayKey(d.date_id);
      if (k in deploysByDay) deploysByDay[k] += 1;
    });

    const trendData = keys.map((k) => ({
      date: k.slice(5),
      incidents: incidentsByDay[k],
      deployments: deploysByDay[k],
    }));

    const volumeData = keys.map((k) => {
      const row = { date: k.slice(5) };
      vList.forEach(v => { row[v] = volumeByDay[k][v] || 0; });
      return row;
    });

    return { 
      kpis: { changeRate, activeIncidentsCount, mttrHours }, 
      trendData, 
      volumeData, 
      clusterData: clusterPrep,
      verticalsList: vList,
      dateKeys: keys.map(k => k.slice(5))
    };
  }, [data, dateRange, regionId]);

  if (error) return <div className="bg-white rounded-xl border border-red-200 p-4 text-sm text-red-700">Error: {error}</div>;

  const show = (v, fmt) => (loading ? '…' : v === null ? '—' : fmt(v));

  return (
    <div className="space-y-6">
      
      {/* Top Level KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard title="Change-Induced Outage Rate" value={show(kpis.changeRate, (v) => `${v.toFixed(1)}%`)} tooltip="Percentage of IT outages caused directly by recent internal code deployments or patch updates." icon={<GitPullRequestArrow size={20} />} />
        <KpiCard title="Active P1/P2 Incidents" value={show(kpis.activeIncidentsCount, (v) => v)} tooltip="Count of severe IT tickets currently open across the enterprise." icon={<AlertTriangle size={20} />} />
        <KpiCard title="MTTR for Business Incidents" value={show(kpis.mttrHours, (v) => `${v.toFixed(1)} hrs`)} tooltip="Mean Time To Resolution: The average time taken by IT to fully resolve business-impacting outages." icon={<Timer size={20} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* KPI 4: System Updates vs Outages */}
        <ChartCard title="System Updates vs. Outages" tooltip="Proves if IT patches (e.g., Sunday night) cause Monday morning outages.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <ChartTooltip content={<TrendTooltip />} />
                <Line name="Incidents" type="monotone" dataKey="incidents" stroke="#0284c7" strokeWidth={2} dot={<DeploymentDot />} activeDot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <span className="inline-block h-3 w-3 rounded-full bg-amber-500 border-2 border-white shadow-sm" />
            Large marker = Deployment occurred that day
          </p>
        </ChartCard>

        {/* KPI 5: Helpdesk Ticket Vol by Vertical */}
        <ChartCard title="Ticket Volume by Vertical" tooltip="Highlights if a specific business vertical is complaining disproportionately.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volumeData} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <ChartTooltip cursor={{ fill: '#f1f5f9' }} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                {verticalsList.map((v, i) => (
                  <Bar key={v} dataKey={v} stackId="a" fill={VERTICAL_COLORS[v] || '#cbd5e1'} radius={i === verticalsList.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* KPI 6: The Change Impact Matrix */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold tracking-wide uppercase text-slate-700">Change Impact Matrix</h3>
            <Tooltip content="Matrix mapping incidents by Vertical and Date. Clusters indicate multiple issues in a single day.">
              <button className="focus:outline-none"><HelpCircle size={16} className="text-slate-400" /></button>
            </Tooltip>
          </div>
          
          <div className="h-[400px] w-full border border-slate-200 rounded-xl bg-slate-50 p-4 shadow-inner">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 40, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="#cbd5e1" />
                
                {/* Fixed X-Axis: Strict Numeric Grid mapped back to Strings */}
                <XAxis 
                  dataKey="x" 
                  type="number" 
                  ticks={verticalsList.map((_, i) => i)} 
                  tickFormatter={(val) => verticalsList[val]} 
                  domain={[-0.5, verticalsList.length - 0.5]}
                  tick={{ fontSize: 12, fill: '#475569', fontWeight: 600 }} 
                  tickLine={false} 
                  axisLine={false} 
                />
                
                {/* Fixed Y-Axis: Strict Numeric Grid mapped back to Strings */}
                <YAxis 
                  dataKey="y" 
                  type="number" 
                  ticks={dateKeys.map((_, i) => i)} 
                  tickFormatter={(val) => dateKeys[val]} 
                  domain={[-0.5, dateKeys.length - 0.5]}
                  tick={{ fontSize: 12, fill: '#64748b' }} 
                  tickLine={false} 
                  axisLine={false} 
                />
                
                <ZAxis dataKey="z" range={[50, 600]} name="Severity" />
                <ChartTooltip cursor={{ strokeDasharray: '3 3', stroke: '#94a3b8' }} content={<ClusterTooltip />} />
                
                {/* Custom Node Rendering */}
                <Scatter data={clusterData} shape={<ImpactNode />} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          
          {/* Enhanced Legend */}
          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3 justify-center text-sm text-slate-600 font-medium bg-slate-50 py-3 rounded-lg border border-slate-100">
            <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-full bg-amber-500 shadow-sm border border-white"></span> Internal Change</div>
            <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-full bg-sky-600 shadow-sm border border-white"></span> External / System</div>
            <div className="w-px h-4 bg-slate-300 hidden sm:block"></div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-4 w-4 items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-400 opacity-40"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 border-2 border-slate-500"></span>
              </span>
              P1 Critical
            </div>
            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full border-2 border-slate-500"></span> P2 High</div>
          </div>
        </div>

      </div>
    </div>
  );
}