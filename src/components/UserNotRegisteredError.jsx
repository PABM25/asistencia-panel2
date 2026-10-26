import React from 'react';
import { useAuth } from '@/lib/AuthContext';

const UserNotRegisteredError = () => {
  const { user, logout } = useAuth();
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <div className="max-w-md w-full p-8 bg-muted rounded-3xl">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-6 rounded-full bg-peach">
            <svg className="w-8 h-8 text-sienna" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="page-title mb-4">Acceso restringido</h1>
          <p className="text-muted-foreground mb-8">
            La cuenta {user?.email ? <strong>{user.email}</strong> : 'actual'} no tiene permisos de administrador. Pide a un administrador que te dé acceso.
          </p>
          <div className="p-4 bg-card rounded-2xl text-sm text-muted-foreground">
            <p>Si crees que es un error, puedes:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Comprobar que entraste con la cuenta correcta</li>
              <li>Pedir acceso a un administrador</li>
              <li>Cerrar sesión y volver a entrar</li>
            </ul>
          </div>
          <button
            onClick={() => logout()}
            className="mt-6 inline-flex items-center rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground hover:bg-primary/85"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserNotRegisteredError;
