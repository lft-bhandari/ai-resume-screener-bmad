import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';

export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Skip to main content — AC7: sr-only focus:not-sr-only at layout root */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[#111111] focus:shadow-md"
      >
        Skip to main content
      </a>

      <AppSidebar />

      <main
        id="main-content"
        className="flex-1 overflow-auto bg-bg"
        tabIndex={-1}
      >
        <Outlet />
      </main>
    </div>
  );
}
