import { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';

// Cada página se descarga solo cuando se visita (el bundle inicial pesa menos).
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Empleados = lazy(() => import('@/pages/Empleados'));
const Asistencia = lazy(() => import('@/pages/Asistencia'));
const Horarios = lazy(() => import('@/pages/Horarios'));
const Turnos = lazy(() => import('@/pages/Turnos'));
const Informes = lazy(() => import('@/pages/Informes'));
const Kioscos = lazy(() => import('@/pages/Kioscos'));
const Kiosco = lazy(() => import('@/pages/Kiosco'));

const Spinner = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, authError } = useAuth();
  const { pathname } = useLocation();

  // El kiosco no usa la sesión: funciona con el token del dispositivo.
  if (pathname === '/kiosco') {
    return (
      <Suspense fallback={<Spinner />}>
        <Kiosco />
      </Suspense>
    );
  }

  if (isLoadingAuth) {
    return <Spinner />;
  }

  // Usuario con sesión pero sin rol de administrador.
  if (authError?.type === 'user_not_registered') {
    return <UserNotRegisteredError />;
  }

  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/empleados" element={<Empleados />} />
            <Route path="/asistencia" element={<Asistencia />} />
            <Route path="/turnos" element={<Turnos />} />
            <Route path="/horarios" element={<Horarios />} />
            <Route path="/informes" element={<Informes />} />
            <Route path="/kioscos" element={<Kioscos />} />
          </Route>
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
