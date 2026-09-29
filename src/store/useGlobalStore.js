import { create } from 'zustand';

export const useGlobalStore = create((set) => ({
  dateRange: 'Last 7 Days',
  regionId: 'All',
  modelId: 'All',
  selectedAssetId: null,
  setGlobalFilter: (key, value) => set({ [key]: value }),
  selectAsset: (id) => set({ selectedAssetId: id }),
  clearAsset: () => set({ selectedAssetId: null }),
}));