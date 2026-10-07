// Top-level pages, in order: drives the header nav and the "Page n" badge on each page header
export const NAV_ITEMS = [
  { path: '/executive-overview', label: 'Overview', title: 'IT Executive Overview', description: 'Executive summary of incidents, recovery, downtime cost and software spend across the IT estate.' },
  { path: '/app-reliability', label: 'App Reliability', title: 'App Reliability', description: 'Availability, latency, incidents and recovery for the business-critical services.' },
  { path: '/deployments', label: 'Deployments', title: 'Deployments', description: 'How often we release, how fast changes reach production, how often releases fail and how quickly we recover (DORA metrics).' },
  { path: '/security', label: 'Security', title: 'Security', description: 'Vulnerabilities and patch SLAs, security incidents, threats and phishing resilience.' },
  { path: '/licensing-subs', label: 'Licensing & Subscriptions', title: 'Licensing & Subscriptions', description: 'Software spend, usage, renewals, vendors and contract documents.' },
];

export const pageFor = (pathname) => {
  const i = NAV_ITEMS.findIndex((n) => pathname.startsWith(n.path));
  return i < 0 ? null : { ...NAV_ITEMS[i], page: i + 1 };
};
