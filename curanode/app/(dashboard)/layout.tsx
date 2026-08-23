import { Toaster } from 'react-hot-toast';
import EmergencyAlert from '@/components/hospital/dashboard/EmergencyAlert';
import Sidebar from '@/components/hospital/dashboard/Sidebar';
import TopHeader from '@/components/hospital/dashboard/TopHeader';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col md:flex-row md:overflow-hidden bg-[var(--bg-main)] font-sans selection:bg-cura-teal-light selection:text-cura-teal-dark">
      <Sidebar />
      
      {/* Main Content Area */}
      <div className="flex-grow md:overflow-y-auto bg-[var(--bg-main)]">
        <div className="p-6 md:p-10 lg:p-12 max-w-[1600px] mx-auto w-full">
          <TopHeader />
          {children}
        </div>
      </div>
      
      {/* Global Toast Provider */}
      <Toaster 
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--border-light)',
            fontWeight: 600,
          },
        }}
      />
      {/* Global Realtime Listener for Hospital Dashboard */}
      <EmergencyAlert />
    </div>
  );
}
