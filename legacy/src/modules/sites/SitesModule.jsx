import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Building2, Cpu, Database, Factory, Router, Server, Unplug, Wifi } from 'lucide-react';
import KpiCard from '../../components/KpiCard';
import Panel, { PageHeader } from '../../components/Panel';
import StatusBadge, { PriorityBadge } from '../../components/StatusBadge';
import LoadError from '../../components/LoadError';
import Drawer from '../../components/Drawer';
import IncidentDrawer from '../../components/IncidentDrawer';
import { useRpc } from '../../hooks/useRpc';
import { useItFilters } from '../../hooks/useItFilters';
import { usePatchUrlParams, useUrlParam } from '../../hooks/useUrlParam';
import { useGlobalStore } from '../../store/useGlobalStore';
import { AVAILABILITY_BUCKETS, INK, SERIES, availabilityColor, axisTick, gridProps, tooltipStyle } from '../../lib/chartTheme';
import { formatNumber, formatPct } from '../../lib/format';

const LAYER_ICON = { L4: Database, L3: Server, L2: Router, L1: Cpu };
const LAYER_TONE = { Healthy: 'good', Degraded: 'warning', Critical: 'critical' };
const TYPE_ORDER = [['Plant', 'Plants', Factory], ['Warehouse', 'Warehouses', Building2], ['Dealer', 'Dealers', Wifi]];
const DEVICE_ORDER = ['Edge Router', 'Switch', 'IoT Gateway', 'Scanner'];
const shortDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

function siteTone(s) {
  if (s.availability < 0.98) return 'critical';
  if (s.availability < 0.995 || s.ping_vs_typical > 1.5) return 'warning';
  return 'good';
}

function SiteDrawer({ siteId, filters, onClose, onIncident }) {
  const { data, loading } = useRpc('it_site_detail', { p_location_id: siteId, p_filters: filters }, Boolean(siteId));
  const { downtime, ping, devices } = useMemo(() => {
    const byDate = new Map();
    const devs = new Set();
    for (const r of data?.daily ?? []) {
      devs.add(r.device_type);
      const row = byDate.get(r.date) || { date: r.date, label: shortDate(r.date) };
      row[`down_${r.device_type}`] = r.downtime_minutes;
      row[`ping_${r.device_type}`] = Number(r.ping_ms);
      byDate.set(r.date, row);
    }
    const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    return { downtime: rows, ping: rows, devices: DEVICE_ORDER.filter((d) => devs.has(d)) };
  }, [data]);
  const site = data?.site;

  return (
    <Drawer open onClose={onClose} title={site?.location_name ?? siteId} subtitle={site ? `${site.location_type} · ${site.region_name} · ${site.address}` : 'Loading…'}>
      {loading && !data ? <p className="text-sm text-slate-500">Loading…</p> : (
        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-600">Downtime minutes per day, by device</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={downtime} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} interval="preserveStartEnd" minTickGap={20} />
                  <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={40} />
                  <Tooltip {...tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
                  {devices.map((d, i) => <Bar key={d} dataKey={`down_${d}`} name={d} stackId="d" fill={SERIES[i]} stroke={INK.surface} strokeWidth={1} isAnimationActive={false} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-600">Average ping (ms), by device</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ping} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK.axis }} interval="preserveStartEnd" minTickGap={20} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} />
                  <Tooltip {...tooltipStyle} formatter={(v, n) => [`${Number(v).toFixed(1)} ms`, n]} />
                  <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
                  {devices.map((d, i) => <Line key={d} dataKey={`ping_${d}`} name={d} stroke={SERIES[i]} strokeWidth={2} dot={false} isAnimationActive={false} />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">Incidents at this site ({data?.incidents.length ?? 0})</h3>
            <ul className="divide-y divide-slate-100">
              {(data?.incidents ?? []).map((i) => (
                <li key={i.incident_id} className="py-2">
                  <button type="button" onClick={() => onIncident(i.incident_id)} className="flex w-full items-center justify-between gap-3 text-left focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">
                    <span className="text-sm text-slate-800 hover:text-sky-700">{i.title}<span className="block text-xs text-slate-500">{i.incident_id} · {i.status} · {new Date(i.open_time).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></span>
                    <PriorityBadge priority={i.priority} />
                  </button>
                </li>
              ))}
              {data && !data.incidents.length && <li className="py-2 text-sm text-slate-500">No incidents recorded at this site in the window.</li>}
            </ul>
          </section>
        </div>
      )}
    </Drawer>
  );
}

export default function SitesModule() {
  const filters = useItFilters();
  const { data, loading, error } = useRpc('it_site_overview', { p_filters: filters });
  const [siteId, setSiteId] = useUrlParam('site');
  const [incident, setIncident] = useUrlParam('incident');
  const patchUrl = usePatchUrlParams();
  const setGlobalFilter = useGlobalStore((s) => s.setGlobalFilter);
  const regionId = useGlobalStore((s) => s.regionId);

  if (error) return <LoadError error={error} what="Sites & OT" />;
  const k = data?.kpis ?? {};
  const show = (v, fmt) => (loading && !data ? '…' : v === null || v === undefined ? '—' : fmt(v));
  const sites = data?.sites ?? [];
  const degraded = sites.filter((s) => siteTone(s) !== 'good');

  return (
    <div className="space-y-6 pb-10">
      <PageHeader title="Sites & OT" window={data?.window} note="network history starts Apr 2026" />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <KpiCard title="Site Network Availability" icon={<Wifi size={20} />} value={show(k.availability, (v) => formatPct(v, 2))}
          sub={`${formatNumber(k.sites)} sites`} tooltip="1 − device downtime minutes ÷ (devices × minutes in the window), across all sites in scope." />
        <KpiCard title="Degraded Sites" icon={<Unplug size={20} />} value={show(k.degraded_sites, formatNumber)}
          delta={k.degraded_sites ? 'Needs attention' : null} deltaTone="bad"
          tooltip="Sites below 99.5% availability or with ping above 1.5× the typical for their site and device type." />
        <KpiCard title="Disconnects per Site-Day" icon={<Router size={20} />} value={show(k.disconnects_per_site_day, (v) => v.toFixed(2))}
          tooltip="Device disconnects ÷ (sites × days)." />
        <KpiCard title="Plant Edge Latency" icon={<Factory size={20} />} value={show(k.plant_edge_ping, (v) => `${v} ms`)}
          tooltip="Average ping of the edge routers at the plants (the IT/OT boundary)." />
        <KpiCard title="Site Incidents" icon={<Server size={20} />} value={show(k.site_incidents, formatNumber)}
          tooltip="IT incidents raised against a specific site in the window." />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel title="OT architecture (Purdue model)" tooltip="Health of each layer for the plants in scope. L4 = ERP service, L3 = MES service + plant edge routers, L2 = plant switches and IoT gateways, L1 = field scanners. Healthy ≥ 99.9%, Degraded ≥ 99%.">
          <ol className="space-y-2">
            {(data?.purdue ?? []).map((l) => {
              const Icon = LAYER_ICON[l.id];
              return (
                <li key={l.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                  <span className="rounded-md bg-slate-50 p-2 text-slate-500"><Icon size={18} aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{l.id}: {l.name}</p>
                    <p className="text-xs text-slate-500">{l.basis} · {formatPct(l.availability, 2)}</p>
                  </div>
                  <StatusBadge status={LAYER_TONE[l.status]} label={l.status} />
                </li>
              );
            })}
          </ol>
        </Panel>
        <Panel title="Regions" className="xl:col-span-2" tooltip="Select a region to filter every module to it (same as the sidebar Region filter).">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(data?.regions ?? []).map((r) => (
              <button key={r.region_id} type="button" onClick={() => setGlobalFilter('regionId', regionId === r.region_id ? 'All' : r.region_id)}
                className={`rounded-lg border px-3 py-2.5 text-left hover:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-500 ${regionId === r.region_id ? 'border-sky-500 bg-sky-50' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-800">{r.region_name}</span>
                  <StatusBadge status={r.degraded > 0 ? 'warning' : 'good'} label={r.degraded > 0 ? `${r.degraded} degraded` : 'All healthy'} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{r.sites} sites · {formatPct(r.availability, 2)} · {r.ping_ms} ms avg ping</p>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Site grid" tooltip="Every site in scope, coloured by network availability; a thick outline marks high latency. Select a site for device-level detail.">
        <div className="space-y-4">
          {TYPE_ORDER.map(([type, label, Icon]) => {
            const list = sites.filter((s) => s.location_type === type).sort((a, b) => a.region_id.localeCompare(b.region_id) || a.location_name.localeCompare(b.location_name));
            if (!list.length) return null;
            return (
              <div key={type}>
                <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Icon size={14} aria-hidden="true" />{label} ({list.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((s) => {
                    const slow = s.ping_vs_typical > 1.5;
                    const name = s.location_name.replace(/^.* - /, '');
                    return (
                      <button key={s.location_id} type="button" onClick={() => setSiteId(s.location_id)}
                        title={`${s.location_name} (${s.region_name}): ${formatPct(s.availability, 2)} available, ${s.ping_ms} ms ping${slow ? ' (high)' : ''}, ${s.incidents} incidents`}
                        aria-label={`${s.location_name}, ${formatPct(s.availability, 2)} available${slow ? ', high latency' : ''}`}
                        className={`h-9 rounded-md px-2 text-[11px] font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 hover:ring-2 hover:ring-slate-700 ${slow ? 'ring-2 ring-offset-1 ring-amber-500' : ''} ${type === 'Dealer' ? 'w-[3.25rem] px-0' : 'min-w-[7rem]'}`}
                        style={{ background: availabilityColor(s.availability), color: s.availability < 0.98 ? '#fff' : undefined }}>
                        {type === 'Dealer' ? s.location_id.replace('LOC0', '') : name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            {AVAILABILITY_BUCKETS.map((b) => <span key={b.label} className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-black/5" style={{ background: b.color }} />{b.label}</span>)}
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm ring-2 ring-amber-500" />ping &gt; 1.5× typical</span>
          </div>
        </div>
      </Panel>

      <Panel title={`Degraded sites (${degraded.length})`} flush tooltip="Sites below 99.5% availability or with ping above 1.5× typical, worst first.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>{['Site', 'Type', 'Region', 'Availability', 'Disconnects / day', 'Ping', 'vs typical', 'Worst device', 'Incidents'].map((h, i) => <th key={h} scope="col" className={`px-4 py-2.5 font-semibold whitespace-nowrap ${i > 2 ? 'text-right' : ''}`}>{h}</th>)}</tr>
            </thead>
            <tbody className="tabular-nums [&_td:not(:first-child)]:whitespace-nowrap">
              {degraded.map((s) => (
                <tr key={s.location_id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2.5"><button type="button" onClick={() => setSiteId(s.location_id)} className="text-left font-medium text-slate-900 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 rounded">{s.location_name}</button></td>
                  <td className="px-4 py-2.5">{s.location_type}</td>
                  <td className="px-4 py-2.5">{s.region_name}</td>
                  <td className={`px-4 py-2.5 text-right ${s.availability < 0.995 ? 'text-red-700 font-semibold' : ''}`}>{formatPct(s.availability, 2)}</td>
                  <td className="px-4 py-2.5 text-right">{s.disconnects_per_day}</td>
                  <td className="px-4 py-2.5 text-right">{s.ping_ms} ms</td>
                  <td className={`px-4 py-2.5 text-right ${s.ping_vs_typical > 1.5 ? 'text-amber-700 font-semibold' : ''}`}>{s.ping_vs_typical}×</td>
                  <td className="px-4 py-2.5 text-right">{s.worst_device}</td>
                  <td className="px-4 py-2.5 text-right">{s.incidents}</td>
                </tr>
              ))}
              {data && !degraded.length && <tr><td colSpan={9} className="px-4 py-6 text-center text-slate-500">No degraded sites.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      {siteId && <SiteDrawer siteId={siteId} filters={filters} onClose={() => setSiteId(null)} onIncident={(id) => patchUrl({ site: null, incident: id })} />}
      {incident && <IncidentDrawer incidentId={incident} onClose={() => setIncident(null)} />}
    </div>
  );
}
