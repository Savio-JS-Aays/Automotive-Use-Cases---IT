import Drawer from '../../../components/Drawer';
import DocumentList from '../DocumentList';
import DocGapsList from '../tables/DocGapsList';
import { decodeDocScope } from '../LicensingContext';

const TITLES = {
  software: (v) => `Documents · product ${v}`,
  contract: (v) => `Documents · contract ${v}`,
  vendor: (v) => `Documents · vendor ${v}`,
  invoice: (v) => `Invoice ${v}`,
  doc_type: (v) => `Documents · ${v}`,
};

/** Document drawer for any scope encoded in ?docs= (product, contract, vendor, invoice, type, gaps, or all). */
export default function DocumentDrawer({ raw, onClose }) {
  const scope = decodeDocScope(raw);
  const [key, value] = Object.entries(scope)[0] ?? [];
  const title = scope.gaps ? 'Documentation gaps' : key ? TITLES[key](value) : 'All licensing documents';
  return (
    <Drawer open onClose={onClose} title={title} subtitle="Agreements, order forms, SLAs, DPAs, SOWs, renewal quotes, invoices and vendor security assessments">
      {scope.gaps ? <DocGapsList /> : <DocumentList scope={scope} withPageFilters={!key} />}
    </Drawer>
  );
}
