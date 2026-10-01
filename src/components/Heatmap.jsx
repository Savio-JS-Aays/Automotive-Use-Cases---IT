/**
 * Row × column grid of cells (e.g. service × day). Colour comes from `colorFor(value)`; every cell has a
 * native tooltip and is a button when `onCell` is given. A legend explains the buckets.
 *
 * rows:  [{ key, label }]
 * cols:  [{ key, label }]   (labels thinned automatically on the axis)
 * value: (rowKey, colKey) => number | null
 */
export default function Heatmap({ rows, cols, value, colorFor, titleFor, onCell, legend, rowLabelWidth = 110, minWidth = 560 }) {
  const tickEvery = Math.max(1, Math.ceil(cols.length / 10));
  return (
    <div className="overflow-x-auto">
      <div className="pr-5" style={{ minWidth }}>
        <div role="grid" aria-label="Heatmap" className="space-y-[2px]">
          {rows.map((r) => (
            <div role="row" key={r.key} className="flex items-center gap-2">
              <div role="rowheader" className="shrink-0 truncate text-xs text-slate-600 text-right" style={{ width: rowLabelWidth }}>{r.label}</div>
              <div className="flex flex-1 gap-[2px]">
                {cols.map((c) => {
                  const v = value(r.key, c.key);
                  const title = titleFor ? titleFor(r, c, v) : `${r.label} · ${c.label}: ${v ?? '—'}`;
                  const style = v === null || v === undefined ? { background: 'transparent', border: '1px dashed #e2e8f0' } : { background: colorFor(v) };
                  return onCell ? (
                    <button key={c.key} type="button" role="gridcell" title={title} aria-label={title} onClick={() => onCell(r, c, v)}
                      className="h-5 flex-1 min-w-[4px] rounded-[2px] hover:outline hover:outline-2 hover:outline-slate-700 focus:outline focus:outline-2 focus:outline-sky-600" style={style} />
                  ) : (
                    <div key={c.key} role="gridcell" title={title} className="h-5 flex-1 min-w-[4px] rounded-[2px]" style={style} />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-2" aria-hidden="true">
          <div className="shrink-0" style={{ width: rowLabelWidth }} />
          <div className="relative flex-1 h-4 text-[10px] text-slate-400">
            {cols.map((c, i) => (i % tickEvery === 0 ? (
              <span key={c.key} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${((i + 0.5) / cols.length) * 100}%` }}>{c.label}</span>
            ) : null))}
          </div>
        </div>
        {legend && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
            {legend.map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-[2px] border border-black/5" style={{ background: l.color }} />{l.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
