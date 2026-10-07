import { useEffect, useMemo, useState } from 'react';
import KpiCard from '../../components/KpiCard';
import { PageHeader } from '../../components/Panel';
import SubTabs from '../../components/SubTabs';
import LoadError from '../../components/LoadError';
import { useRpc } from '../../hooks/useRpc';
import { useRawTables } from '../../hooks/useRawTables';
import { useItFilters } from '../../hooks/useItFilters';
import { usePatchUrlParams, useUrlParam } from '../../hooks/useUrlParam';
import { useGlobalStore } from '../../store/useGlobalStore';
import { fetchAllRows } from '../../lib/fetchAllRows';
import { formatNumber, formatPct } from '../../lib/format';
import { fmtH, secKpis } from './secData';
import VulnBreakdown from './VulnBreakdown';
import VulnTable from './VulnTable';
import ThreatExplorer from './ThreatExplorer';
import SecurityIncidents from './SecurityIncidents';
import SecIncidentDrawer from './SecIncidentDrawer';

const TABLES = {
  incidents: { table: 'it_fact_security_incident', select: '*', options: { orderBy: 'sec_incident_id' } },
  phishing: { table: 'it_fact_phishing_sim', select: '*', options: { orderBy: 'campaign_id' } },
  software: { table: 'it_dim_software', select: 'software_id, software_name', options: { orderBy: 'software_id' } },
  regions: { table: 'dim_region', select: 'region_id, region_name', options: { orderBy: 'region_id' } },
};
const EMPTY_VF = { sev: '', asset: '', sla: '', exploit: false, product: '', q: '', sort: 'risk' };
const scrollTo = (id) => setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);

/** Threat feed rows for the last 12 months (no region / department in this table). */
function useThreats(asOf) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!asOf) return undefined;
    let cancelled = false;
    const d = new Date(`${asOf}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 365);
    fetchAllRows('it_fact_threat_daily', 'date_id, vector, detected, blocked', { orderBy: 'date_id', filter: (q) => q.gte('date_id', d.toISOString().slice(0, 10)).lte('date_id', asOf) })
      .then((r) => { if (!cancelled) setRows(r); }).catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [asOf]);
  return rows;
}

export default function SecurityModule() {
  const filters = useItFilters();
  const department = useGlobalStore((st) => st.secDepartment) || null;
  const asset = useGlobalStore((st) => st.secAsset) || null;
  const [tabParam] = useUrlParam('tab');
  const [sincId] = useUrlParam('sinc');
  const patch = usePatchUrlParams();
  const tab = tabParam === 'threats' ? 'threats' : 'vulns';
  const [vf, setVf] = useState(EMPTY_VF);

  const ov = useRpc('it_sec_overview', { p_filters: filters });
  const vulnsQ = useRpc('it_sec_vulns', { p_filters: filters, p_status: null, p_limit: 2000 });
  const { data: t } = useRawTables(TABLES);
  const w = ov.data?.window;
  const threats = useThreats(w?.as_of);

  const vulns = useMemo(() => (vulnsQ.data ?? []).filter((v) => !asset || v.asset_class === asset), [vulnsQ.data, asset]);
  const open = useMemo(() => vulns.filter((v) => v.status === 'Open'), [vulns]);
  const incs = useMemo(() => (t.incidents ?? []).filter((i) => (!filters.region || i.region_id === filters.region) && (!department || i.department === department)),
    [t.incidents, filters.region, department]);
  const phish = useMemo(() => (t.phishing ?? []).filter((p) => !department || p.department === department), [t.phishing, department]);
  const ready = Boolean(w && vulnsQ.data && t.incidents && t.phishing && threats);
  const k = ready ? secKpis({ vulns, incs, phish, threats, w }) : null;
  const products = useMemo(() => [...new Map(open.filter((v) => v.software_id).map((v) => [v.software_id, v.software_name])).entries()]
    .map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)), [open]);

  if (ov.error) return <LoadError error={ov.error} what="Security" />;
  const show = (v, fmt) => (!k ? '…' : v === null || v === undefined ? '—' : fmt(v));
  const goVulnTable = (patchVf) => { patch({ tab: null }); setVf({ ...EMPTY_VF, sort: vf.sort, ...patchVf }); scrollTo('vuln-table'); };
  const goThreats = (id) => { patch({ tab: 'threats' }); scrollTo(id); };
  const sinc = sincId ? (t.incidents ?? []).find((i) => i.sec_incident_id === sincId) : null;
  const note = [asset && `vulnerabilities: ${asset}`, department && `incidents & phishing: ${department}`].filter(Boolean).join(' · ');

  return (
    <div className="space-y-6 pb-10">
      <PageHeader title="Security" window={w}
        note={`${note ? `showing ${note} (sidebar filters) · ` : ''}vulnerabilities without a region count in every region; the threat feed has no region or department`} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard title="Open Critical Vulnerabilities" value={show(k?.openCritical, formatNumber)} onClick={() => goVulnTable({ sev: 'Critical' })}
          tooltip="Open vulnerabilities with severity Critical (CVSS ≥ 9). Follows Region and Asset Class. Click to list them." />
        <KpiCard title="Past Patch SLA" value={show(k?.pastSla, formatNumber)} onClick={() => goVulnTable({ sla: 'past' })}
          tooltip="Critical (15 d) and High (30 d) vulnerabilities still open after their patch due date. Click to list every overdue vulnerability." />
        <KpiCard title="Patch SLA Compliance" value={show(k?.patchSla, (v) => formatPct(v, 0))}
          tooltip="Of the vulnerabilities patched in the window, the share patched on or before their due date." />
        <KpiCard title="Security Incidents" value={show(k?.incidents, formatNumber)} onClick={() => goThreats('sec-incidents')}
          tooltip="Security incidents detected in the window (Region and Department apply). Click for the incident breakdown." />
        <KpiCard title="Median Time to Detect" value={show(k?.mttd, fmtH)}
          tooltip="Median of (detected − impact start) for security incidents detected in the window." />
        <KpiCard title="Median Time to Contain" value={show(k?.mttc, fmtH)}
          tooltip="Median of (contained − detected) for security incidents detected in the window." />
        <KpiCard title="Phishing Click Rate" value={show(k?.phishClick, (v) => formatPct(v))} onClick={() => goThreats('threats')}
          tooltip="Share of employees who clicked the latest monthly phishing simulation (Department applies). Click, then select the Phishing email tile for the simulation charts." />
        <KpiCard title="Threats Blocked" value={show(k?.blocked, formatNumber)} onClick={() => goThreats('threats')}
          tooltip="Attack attempts blocked by email, endpoint and network controls in the window (block rate in the Threats by vector tiles)." />
      </div>

      <SubTabs label="Security sections" value={tab} onChange={(v) => patch({ tab: v === 'vulns' ? null : v })} tabs={[
        { value: 'vulns', label: 'Vulnerabilities', hint: 'What is open, how old it is, where it sits and what is past its patch deadline; the full list with filters.' },
        { value: 'threats', label: 'Threats & incidents', hint: 'Attack attempts by vector (select one to drill in, incl. phishing simulations) and the security incidents that caused real impact.' },
      ]} />

      {tab === 'vulns' ? (
        <>
          <VulnBreakdown open={open} asOf={w?.as_of ?? '…'} onPickRow={(by, key) => goVulnTable(by === 'severity' ? { sev: key } : { asset: key })} />
          <VulnTable open={open} loading={!vulnsQ.data} f={vf} setF={setVf} products={products} />
        </>
      ) : !ready ? <p className="text-sm text-slate-500">Loading…</p> : (
        <>
          <div id="threats" className="scroll-mt-4">
            <ThreatExplorer threats={threats} incs={incs} phish={phish} window={w} department={department} onOpenIncident={(id) => patch({ sinc: id })} />
          </div>
          <div id="sec-incidents" className="scroll-mt-4">
            <SecurityIncidents incs={incs} window={w} onOpenIncident={(id) => patch({ sinc: id })} />
          </div>
        </>
      )}

      {sinc && (
        <SecIncidentDrawer inc={sinc} threats={threats ?? []} onClose={() => patch({ sinc: null })}
          regionName={(t.regions ?? []).find((r) => r.region_id === sinc.region_id)?.region_name}
          productName={(t.software ?? []).find((s) => s.software_id === sinc.software_id)?.software_name} />
      )}
    </div>
  );
}
