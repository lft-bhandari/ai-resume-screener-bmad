import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileSearch,
  Clock,
  FileText,
  Users,
  ShieldCheck,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ['recruiter', 'admin'] },
  { label: 'Analysis', href: '/analysis', icon: FileSearch, roles: ['recruiter', 'admin'] },
  { label: 'History', href: '/history', icon: Clock, roles: ['recruiter', 'admin'] },
  { label: 'Job Descriptions', href: '/job-descriptions', icon: FileText, roles: ['recruiter', 'admin'] },
  { label: 'Candidates', href: '/candidates', icon: Users, roles: ['interviewer'] },
  { label: 'Admin', href: '/admin', icon: ShieldCheck, roles: ['admin'] },
];

export function AppSidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const visibleItems = NAV_ITEMS.filter(
    (item) => user !== null && item.roles.includes(user.role),
  );

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <nav
      aria-label="Main navigation"
      className="flex flex-col h-screen bg-[#111111] w-16 xl:w-60 flex-shrink-0 transition-[width] duration-200"
    >
      {/* Logo area */}
      <div className="flex items-center h-16 px-3 xl:px-5 border-b border-white/10">
        <span className="text-white font-bold text-lg hidden xl:block tracking-tight">
          Leapfrog
        </span>
        <span className="text-[#038E43] font-bold text-xl xl:hidden" aria-hidden="true">
          L
        </span>
      </div>

      {/* Primary nav items */}
      <ul className="flex flex-col gap-0.5 px-2 pt-3 flex-1" role="list">
        {visibleItems.map((item) => (
          <li key={item.href}>
            <NavLink
              to={item.href}
              end={item.href === '/'}
              aria-label={item.label}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-md px-3 py-2 transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#038E43]',
                  'justify-center xl:justify-start',
                  isActive
                    ? 'bg-[#038E43]/15 text-[#038E43]'
                    : 'text-white/70 hover:text-white hover:bg-white/10',
                ].join(' ')
              }
            >
              <item.icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
              <span className="hidden xl:inline text-sm font-medium">{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      {/* Bottom: user avatar + logout */}
      <div className="flex flex-col gap-0.5 px-2 pb-4 border-t border-white/10 pt-3">
        {/* User info row */}
        <div className="flex items-center gap-3 px-3 py-2 justify-center xl:justify-start">
          <div
            className="h-8 w-8 rounded-full bg-[#038E43] flex items-center justify-center flex-shrink-0"
            aria-hidden="true"
          >
            <span className="text-white text-xs font-bold uppercase">
              {user?.email?.[0] ?? '?'}
            </span>
          </div>
          <div className="hidden xl:flex flex-col min-w-0">
            <span className="text-white text-sm truncate">{user?.email}</span>
            <span className="text-white/50 text-xs capitalize">{user?.role}</span>
          </div>
        </div>

        {/* Logout button */}
        <button
          onClick={() => void handleLogout()}
          aria-label="Logout"
          className={[
            'flex items-center gap-3 w-full rounded-md px-3 py-2 transition-colors',
            'text-white/70 hover:text-white hover:bg-white/10',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#038E43]',
            'justify-center xl:justify-start',
          ].join(' ')}
        >
          <LogOut className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <span className="hidden xl:inline text-sm font-medium">Logout</span>
        </button>
      </div>
    </nav>
  );
}
