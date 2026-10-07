import { useMemo, useState } from 'react';
import Heatmap from '../../../components/Heatmap';
import Segmented, { ToolbarSelect } from '../../../components/Segmented';
import { formatMonth, formatNumber, formatPct } from '../../../lib/format';
import { UTIL_BUCKETS, utilColor } from '../constants';

/**
 * One utilisation heatmap with two views: product × month (trend) and product × region (latest month).
 * Filters: month range, products shown (all / below target / ≥ 1,000 seats), sort, and a product search.
 */
export default function UtilisationHeatmap({ byMonth = [], byRegion = [], target = 0.85, onProduct }) {
  const [view, setView] = useState('month');
  const [range, setRange] = useState('12');
  const [show, setShow] = useState('all');
  const [sort, setSort] = useState('least');
  const [q, setQ] = useState('');

  const model = useMemo(() => {
    const months = [...new Set(byMonth.map((c) => c.month))].sort();
    const last = months[months.length - 1];
    const cell = new Map(byMonth.map((c) => [`${c.software_id}|${c.month}`, c]));
    const regionCell = new Map(byRegion.map((c) => [`${c.software_id}|${c.region_id}`, c]));
    const regions = [...new Map(byRegion.map((c) => [c.region_id, c.region_name])).entries()].map(([key, label]) => ({ key, label }));
    const products = [...new Map(byMonth.map((c) => [c.software_id, c.short_name])).entries()].map(([id, name]) => {
      const latest = cell.get(`${id}|${last}`);
      const first = cell.get(`${id}|${months[Math.max(0, months.length - 12)]}`);
      return { id, name, util: latest?.util ?? null, seats: latest?.purchased ?? 0, change: latest && first ? latest.util - first.util : null };
    });
    return { months, cell, regionCell, regions, products };
  }, [byMonth, byRegion]);

  const rows = useMemo(() => {
    let p = model.products;
    if (show === 'below') p = p.filter((x) => x.util != null && x.util < target);
    if (show === 'large') p = p.filter((x) => x.seats >= 1000);
    if (q.trim()) p = p.filter((x) => x.name.toLowerCase().includes(q.trim().toLowerCase()));
    const cmp = { least: (a, b) => (a.util ?? 2) - (b.util ?? 2), name: (a, b) => a.name.localeCompare(b.name), seats: (a, b) => b.seats - a.seats, fall: (a, b) => (a.change ?? 0) - (b.change ?? 0) }[sort];
    return [...p].sort(cmp).map((x) => ({ key: x.id, label: `${x.name} · ${x.util == null ? '—' : formatPct(x.util, 0)}` }));
  }, [model.products, show, sort, q, target]);

  const months = (range === 'all' ? model.months : model.months.slice(-Number(range))).map((m) => ({ key: m, label: formatMonth(m) }));
  const legend = UTIL_BUCKETS.map((b) => ({ label: b.label, color: b.color }));
  const nameOf = (id) => model.products.find((p) => p.id === id)?.name ?? id;
  const latestLabel = model.months.length ? formatMonth(model.months[model.months.length - 1]) : '';

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented label="View" value={view} onChange={setView} options={[{ value: 'month', label: 'By month' }, { value: 'region', label: `By region · ${latestLabel}` }]} />
        {view === 'month' && (
          <Segmented label="Months" value={range} onChange={setRange} options={[{ value: '6', label: '6 m' }, { value: '12', label: '12 m' }, { value: 'all', label: 'All' }]} />
        )}
        <ToolbarSelect label="Products" value={show} onChange={setShow}>
          <option value="all">All</option>
          <option value="below">Below {Math.round(target * 100)}% target</option>
          <option value="large">1,000+ seats</option>
        </ToolbarSelect>
        <ToolbarSelect label="Sort" value={sort} onChange={setSort}>
          <option value="least">Least utilised</option>
          <option value="fall">Biggest fall (12 m)</option>
          <option value="seats">Most seats</option>
          <option value="name">Name</option>
        </ToolbarSelect>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find product" aria-label="Find product"
          className="w-36 rounded-md border border-slate-300 bg-white py-1 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500" />
        <span className="ml-auto text-xs text-slate-500">{rows.length} of {model.products.length} products</span>
      </div>
      {!model.products.length ? <p className="text-sm text-slate-500">Loading…</p> : !rows.length ? <p className="py-6 text-center text-sm text-slate-500">No products match.</p> : view === 'month' ? (
        <Heatmap rows={rows} cols={months} rowLabelWidth={150}
          value={(r, c) => model.cell.get(`${r}|${c}`)?.util ?? null}
          colorFor={utilColor}
          titleFor={(r, c, v) => { const x = model.cell.get(`${r.key}|${c.key}`); return `${nameOf(r.key)} · ${c.label}: ${v == null ? 'no data' : `${formatPct(v)} (${formatNumber(x.active30)} of ${formatNumber(x.purchased)} active)`}`; }}
          onCell={(r) => onProduct(r.key)} legend={legend} />
      ) : (
        <Heatmap rows={rows} cols={model.regions} rowLabelWidth={150} minWidth={420}
          value={(r, c) => model.regionCell.get(`${r}|${c}`)?.util ?? null}
          colorFor={utilColor}
          titleFor={(r, c, v) => { const x = model.regionCell.get(`${r.key}|${c.key}`); return `${nameOf(r.key)} · ${c.label}: ${v == null ? 'no seats' : `${formatPct(v)} (${formatNumber(x.active30)} of ${formatNumber(x.purchased)} active)`}`; }}
          onCell={(r) => onProduct(r.key)} legend={legend} />
      )}
    </div>
  );
}
