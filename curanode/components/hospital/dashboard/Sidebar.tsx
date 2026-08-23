'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { name: 'Incident Queue', href: '/hospital/incidents', icon: '🚑' },
    { name: 'Ambulance Fleet', href: '/hospital/fleet', icon: '🚐' },
    { name: 'Resource Management', href: '/hospital/resources', icon: '🏥' },
  ];

  return (
    <div className="w-full flex-none md:w-[280px] bg-white border-r border-border-light p-6 shadow-sm z-10 flex flex-col h-full md:rounded-none">
      {/* Sidebar Header */}
      <div className="mb-10 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-cura-teal-soft flex items-center justify-center shadow-sm border border-border-teal">
          <svg className="w-5 h-5 text-cura-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h2 className="text-[22px] font-bold tracking-[-0.02em] text-text-primary" style={{ fontFamily: 'var(--font-serif-display), serif' }}>
          CuraNode <span className="text-cura-teal font-medium">Hospital</span>
        </h2>
      </div>
      
      {/* Navigation */}
      <nav className="space-y-1.5 flex-1">
        <div className="px-3 mb-2 text-[11px] font-semibold tracking-[0.08em] text-text-secondary uppercase">Command Center</div>
        {navItems.map((item) => {
          const isActive = pathname?.startsWith(item.href);
          return (
            <Link 
              key={item.href}
              href={item.href} 
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium transition-all duration-200 group ${
                isActive 
                  ? 'bg-cura-teal text-white shadow-sm' 
                  : 'text-[#365B62] hover:bg-[#EAF8F5] hover:text-text-primary hover:translate-x-[2px]'
              }`}
            >
              <span className={`text-xl transition-all duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-110 group-hover:text-cura-teal'}`}>
                {item.icon}
              </span>
              {item.name}
            </Link>
          );
        })}
      </nav>
      
      {/* Footer Area */}
      <div className="pt-6 mt-6 flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary uppercase">Connected To</span>
          <span className="text-sm font-semibold text-text-primary leading-tight">CuraNode Network</span>
          <span className="text-[11px] text-success font-semibold tracking-wide flex items-center gap-1 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
            Real-time sync active
          </span>
        </div>
        
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-text-primary leading-tight">Hospital Admin</span>
          <span className="text-[11px] text-text-muted font-semibold tracking-wide flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-text-muted"></span>
            Authenticated
          </span>
        </div>
      </div>
    </div>
  );
}
