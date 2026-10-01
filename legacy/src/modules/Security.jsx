import { useMemo } from 'react';
import { ShieldAlert, Timer, ShieldX, ShieldCheck, HelpCircle } from 'lucide-react';
import { 
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, Legend, ResponsiveContainer 
} from 'recharts';
import KpiCard from '../components/KpiCard';
import { useGlobalStore } from '../store/useGlobalStore';
import { lastNDayKeys } from '../lib/dateUtils';

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
// UPDATED: Strict OEM Departments and Software
// -------------------------------------------------------------------------
const VECTORS = ['Phishing', 'Malware', 'DDoS', 'Insider Threat', 'SQLi'];
const DEPARTMENTS = ['Aftersales', 'Corporate', 'Finance', 'HR', 'Logistics', 'Manufacturing', 'Sales'];
const COLORS = ['#ef4444', '#f97316', '#eab308', '#3b82f6', '#8b5cf6'];
const OEM_APPS = ['Dealer Portal', 'MES (Factory Control)', 'SAP S/4HANA', 'Oracle TMS', 'Workday', 'Customer Service Hub'];

const generateSecurityData = () => {
  const incidents = Array.from({ length: 65 }, (_, i) => {
    const priority = Math.random() > 0.8 ? 1 : Math.random() > 0.4 ? 2 : 3;
    return {
      id: `INC-${1000 + i}`,
      vector: VECTORS[Math.floor(Math.random() * VECTORS.length)],
      department: DEPARTMENTS[Math.floor(Math.random() * DEPARTMENTS.length)],
      priority,
      status: i < 8 ? 'Open' : 'Resolved',
      mttcMins: priority === 1 ? Math.floor(Math.random() * 60) + 10 : Math.floor(Math.random() * 180) + 30,
      app: OEM_APPS[Math.floor(Math.random() * OEM_APPS.length)]
    };
  });

  const vulnerabilities = {
    '0-15 Days': 42,
    '16-30 Days': 18,
    '30+ Days': 7,
    criticalUnpatched: 12
  };

  return { incidents, vulnerabilities };
};

export default function Security() {
  const dateRange = useGlobalStore((s) => s.dateRange);

  const { kpis, incidentData, trendData, vulnData, vectorData, departmentData } = useMemo(() => {
    const { incidents, vulnerabilities } = generateSecurityData();

    const activeCritical = incidents.filter(i => i.priority === 1 && i.status === 'Open').length;
    const resolved = incidents.filter(i => i.status === 'Resolved' && (i.priority === 1 || i.priority === 2));
    const mttc = resolved.length ? resolved.reduce((sum, i) => sum + i.mttcMins, 0) / resolved.length : 0;
    const criticalUnpatched = vulnerabilities.criticalUnpatched;
    const blockedThreats = 142058; 

    // Chart: Security Incidents by Department (Stacked)
    const deptMap = {};
    DEPARTMENTS.forEach(d => deptMap[d] = { department: d, P1: 0, P2: 0, P3: 0 });
    incidents.forEach(i => {
      deptMap[i.department][`P${i.priority}`] += 1;
    });

    const keys = lastNDayKeys(30);
    const trend = keys.map(k => ({
      date: k.slice(5),
      alerts: Math.floor(Math.random() * 50) + 20
    }));

    const vulnAge = [
      { age: '0-15 Days', count: vulnerabilities['0-15 Days'] },
      { age: '16-30 Days', count: vulnerabilities['16-30 Days'] },
      { age: '30+ Days', count: vulnerabilities['30+ Days'] }
    ];

    const vectorMap = {};
    incidents.forEach(i => { vectorMap[i.vector] = (vectorMap[i.vector] || 0) + 1; });
    const vectorPlot = Object.keys(vectorMap).map(k => ({ name: k, value: vectorMap[k] }));

    return {
      kpis: { activeCritical, mttc, criticalUnpatched, blockedThreats },
      incidentData: incidents.sort((a, b) => a.priority - b.priority),
      trendData: trend,
      vulnData: vulnAge,
      departmentData: Object.values(deptMap),
      vectorData: vectorPlot
    };
  }, [dateRange]);

  return (
    <div className="space-y-6 pb-10">
      
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Active Critical Incidents" value={kpis.activeCritical} tooltip="Ongoing Priority 1 security events." icon={<ShieldAlert size={20} className="text-red-500" />} />
        <KpiCard title="Mean Time to Contain (MTTC)" value={`${kpis.mttc.toFixed(0)} mins`} tooltip="Average time to isolate P1/P2 threats." icon={<Timer size={20} />} />
        <KpiCard title="Critical Unpatched Flaws" value={kpis.criticalUnpatched} tooltip="Known vulnerabilities with CVSS > 9.0 exposed." icon={<ShieldX size={20} />} />
        <KpiCard title="Blocked Threats Volume" value={kpis.blockedThreats.toLocaleString()} tooltip="Cyber attacks successfully blocked over the last 30 days." icon={<ShieldCheck size={20} className="text-emerald-500" />} />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        <ModuleCard title="Security Incidents by Department" tooltip="Identifies targeted business units by volume and severity of attacks.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={departmentData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="department" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} interval={0} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <ChartTooltip cursor={{ fill: '#f1f5f9' }} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar dataKey="P1" name="P1 Critical" stackId="a" fill="#ef4444" barSize={35} />
                <Bar dataKey="P2" name="P2 High" stackId="a" fill="#f59e0b" />
                <Bar dataKey="P3" name="P3 Medium" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ModuleCard>

        <ModuleCard title="Threat Detection Trend (30 Days)" tooltip="Volume of incoming security alerts indicating active attack campaigns.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="alertFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <ChartTooltip />
                <Area type="monotone" dataKey="alerts" name="Security Alerts" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#alertFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ModuleCard>

        <ModuleCard title="Vulnerability Aging Risk" tooltip="How long critical security flaws are left unpatched.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={vulnData} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="age" type="category" width={80} tick={{ fontSize: 12, fill: '#475569', fontWeight: 500 }} axisLine={false} tickLine={false} />
                <ChartTooltip cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="count" name="Unpatched Flaws" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={35} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ModuleCard>

        <ModuleCard title="Attack Vector Breakdown" tooltip="Categorization of threats to guide security investments.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  data={vectorData} 
                  innerRadius={60} 
                  outerRadius={90} 
                  paddingAngle={5} 
                  dataKey="value" 
                  label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`} 
                  labelLine={false}
                >
                  {vectorData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <ChartTooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ModuleCard>
      </div>

      {/* Threat & Incident Tracker Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="text-sm font-bold tracking-wide uppercase text-slate-700">Threat & Incident Tracker</h3>
        </div>
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200 sticky top-0">
              <tr>
                <th className="px-5 py-3 font-semibold">Incident ID</th>
                <th className="px-5 py-3 font-semibold">Severity</th>
                <th className="px-5 py-3 font-semibold">Threat Type</th>
                <th className="px-5 py-3 font-semibold">Target Application</th>
                <th className="px-5 py-3 font-semibold">Department</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">MTTC</th>
              </tr>
            </thead>
            <tbody>
              {incidentData.map((inc) => (
                <tr key={inc.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-900">{inc.id}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${inc.priority === 1 ? 'bg-red-100 text-red-700' : inc.priority === 2 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                      P{inc.priority} {inc.priority === 1 ? 'Critical' : inc.priority === 2 ? 'High' : 'Medium'}
                    </span>
                  </td>
                  <td className="px-5 py-3">{inc.vector}</td>
                  <td className="px-5 py-3 font-medium text-slate-900">{inc.app}</td>
                  <td className="px-5 py-3 font-medium text-slate-700">{inc.department}</td>
                  <td className="px-5 py-3 font-medium">{inc.status}</td>
                  <td className="px-5 py-3">{inc.mttcMins} mins</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}