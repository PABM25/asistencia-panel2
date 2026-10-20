import { useState } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Clock,
  CalendarClock,
  FileBarChart,
  Menu,
  X,
  Fingerprint,
  CalendarRange,
  LogOut,
  TabletSmartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/empleados", label: "Empleados", icon: Users },
  { to: "/asistencia", label: "Asistencia", icon: Clock },
  { to: "/turnos", label: "Turnos", icon: CalendarRange },
  { to: "/horarios", label: "Horarios", icon: CalendarClock },
  { to: "/informes", label: "Informes", icon: FileBarChart },
  { to: "/kioscos", label: "Kiosco", icon: TabletSmartphone },
];

function NavLinks({ onNavigate }) {
  return (
    <nav className="flex flex-col gap-1 px-3">
      {navItems.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )
          }
        >
          <Icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function UserFooter() {
  const { user, logout } = useAuth();
  return (
    <div className="border-t p-4 space-y-3">
      {user?.email && (
        <p className="truncate text-xs text-muted-foreground" title={user.email}>
          {user.email}
        </p>
      )}
      <button
        onClick={() => logout()}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        <LogOut className="h-4 w-4" />
        Cerrar sesión
      </button>
    </div>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col border-r bg-background">
        <div className="flex h-16 items-center gap-2.5 border-b px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Fingerprint className="h-5 w-5" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">AsistenciaPro</span>
            <span className="text-xs text-muted-foreground">Panel de control</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <NavLinks />
        </div>
        <UserFooter />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-background shadow-xl flex flex-col">
            <div className="flex h-16 items-center justify-between border-b px-6">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Fingerprint className="h-5 w-5" />
                </div>
                <span className="text-sm font-semibold">AsistenciaPro</span>
              </div>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-4">
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
            <UserFooter />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 backdrop-blur px-4">
          <button onClick={() => setOpen(true)} className="text-muted-foreground hover:text-foreground">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold">AsistenciaPro</span>
          </div>
        </header>

        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}