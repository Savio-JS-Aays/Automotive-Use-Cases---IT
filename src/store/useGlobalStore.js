import { create } from 'zustand';

// Global sidebar filters. dateRange is a rolling window ending at the as-of date (it_config); regionId is 'All' or a dim_region id.
export const useGlobalStore = create((set) => ({
  dateRange: 'Last 30 Days',
  regionId: 'All',
  setGlobalFilter: (key, value) => set({ [key]: value }),
}));
