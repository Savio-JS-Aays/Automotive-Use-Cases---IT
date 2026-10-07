import { create } from 'zustand';

// Global sidebar filters. dateRange is a rolling window ending at the as-of date (it_config); regionId is 'All' or a dim_region id.
export const useGlobalStore = create((set) => ({
  dateRange: 'Last 30 Days',
  regionId: 'All',
  incidentPriority: 'all', // 'all' | '1'..'4' | '12' (Overview + App Reliability)
  deployService: '',       // service_id or '' (Deployments page)
  changeType: '',          // 'Code' | 'Config' | 'Infra' | '' (Deployments page)
  secDepartment: '',       // security incidents + phishing department (Security page)
  secAsset: '',            // vulnerability asset class (Security page)
  setGlobalFilter: (key, value) => set({ [key]: value }),
}));
