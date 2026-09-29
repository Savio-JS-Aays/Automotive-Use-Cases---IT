import React from 'react';
import { NavLink } from 'react-router-dom';
import { useGlobalStore } from '../store/useGlobalStore';
import { Activity, Server, ActivitySquare, Network, PowerSquare, X } from 'lucide-react';

export default function DashboardLayout({ children }) {
  const { 
    selectedAssetId, 
    clearAsset, 
    dateRange, 
    regionId, 
    modelId, 
    setGlobalFilter 
  } = useGlobalStore();

  const navItems = [
    { path: '/executive-overview', label: 'Overview', icon: Activity },
    { path: '/app-reliability', label: 'App Reliability', icon: Server },
    { path: '/it-ot-health', label: 'IT-to-OT Health', icon: ActivitySquare },
    { path: '/change-impact', label: 'Change Impact', icon: PowerSquare },
  ];

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans">
      {/* Top Navigation */}
      <header className="h-16 bg-slate-900 text-white flex items-center justify-between px-6 shrink-0 border-b border-slate-800 shadow-sm z-10">
        <div className="flex items-center gap-8">
          <div className="font-bold text-xl tracking-wide flex items-center gap-2">
            <Activity className="text-sky-400" />
            <span>Fleet Command</span>
          </div>
          <nav className="hidden md:flex space-x-1">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive 
                      ? 'bg-slate-800 text-sky-400' 
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <item.icon size={16} />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-full bg-sky-600 border-2 border-slate-700 flex items-center justify-center text-sm font-bold text-white shadow-sm">
            SJ
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-64 bg-white border-r border-slate-200 p-5 shrink-0 flex flex-col gap-6 overflow-y-auto z-0">
          <div>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Global Filters</h2>
            
            {selectedAssetId ? (
              <div className="bg-sky-50 border border-sky-200 rounded-lg p-4">
                <p className="text-xs text-sky-600 font-semibold uppercase mb-1">Asset View Active</p>
                <p className="text-sm font-bold text-slate-900 mb-3 break-all">{selectedAssetId}</p>
                <button 
                  onClick={clearAsset}
                  className="w-full flex items-center justify-center gap-2 bg-white border border-slate-300 text-slate-700 py-1.5 rounded-md text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  <X size={16} /> Clear Asset
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Date Range</label>
                  <select 
                    value={dateRange} 
                    onChange={(e) => setGlobalFilter('dateRange', e.target.value)}
                    className="w-full border border-slate-300 rounded-md py-1.5 px-3 text-sm focus:ring-sky-500 focus:border-sky-500 outline-none"
                  >
                    <option>Last 7 Days</option>
                    <option>Last 30 Days</option>
                    <option>Last 90 Days</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Region</label>
                  <select 
                    value={regionId} 
                    onChange={(e) => setGlobalFilter('regionId', e.target.value)}
                    className="w-full border border-slate-300 rounded-md py-1.5 px-3 text-sm focus:ring-sky-500 focus:border-sky-500 outline-none"
                  >
                    <option>All</option>
                    <option>REG001</option>
                    <option>REG002</option>
                    <option>REG003</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Model</label>
                  <select 
                    value={modelId} 
                    onChange={(e) => setGlobalFilter('modelId', e.target.value)}
                    className="w-full border border-slate-300 rounded-md py-1.5 px-3 text-sm focus:ring-sky-500 focus:border-sky-500 outline-none"
                  >
                    <option>All</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="p-6 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}