import '@simpletpv/ui/login.css';
import './catalog.css';
import './styles.css';

import { LoginForm, type NavGroup, type NavItem, Sidebar } from '@simpletpv/ui';
import {
  BarChart2,
  CheckSquare,
  LayoutDashboard,
  Package,
  Receipt,
  ShoppingCart,
  Store,
  Tag,
  Users,
} from 'lucide-react';
import { useState } from 'react';

import { CatalogPage } from './CatalogPage.js';
import { DashboardPage } from './DashboardPage.js';
import { FamiliesPage } from './FamiliesPage.js';
import { api, useAuthStore } from './lib/auth.js';
import { PurchasesPage } from './PurchasesPage.js';
import { SalesHistoryPage } from './SalesHistoryPage.js';
import { StockPage } from './StockPage.js';
import { StoresPage } from './StoresPage.js';
import { UsersPage } from './UsersPage.js';
import { VerifactuPage } from './VerifactuPage.js';

type Tab =
  | 'dashboard'
  | 'catalog'
  | 'families'
  | 'stock'
  | 'users'
  | 'stores'
  | 'sales'
  | 'purchases'
  | 'verifactu';

const GROUPS: NavGroup[] = [
  { id: 'tienda', label: 'Tienda' },
  { id: 'gestion', label: 'Gestión' },
  { id: 'ventas', label: 'Ventas' },
];

const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'catalog', label: 'Catálogo', icon: <Package size={18} />, group: 'tienda' },
  { id: 'families', label: 'Familias', icon: <Tag size={18} />, group: 'tienda' },
  { id: 'stock', label: 'Stock', icon: <BarChart2 size={18} />, group: 'tienda' },
  { id: 'users', label: 'Usuarios', icon: <Users size={18} />, group: 'gestion' },
  { id: 'stores', label: 'Tiendas', icon: <Store size={18} />, group: 'gestion' },
  { id: 'sales', label: 'Ventas', icon: <Receipt size={18} />, group: 'ventas' },
  { id: 'purchases', label: 'Compras', icon: <ShoppingCart size={18} />, group: 'ventas' },
  { id: 'verifactu', label: 'VeriFactu', icon: <CheckSquare size={18} />, group: 'ventas' },
];

const TAB_LABELS: Record<Tab, string> = {
  dashboard: 'Dashboard',
  catalog: 'Catálogo',
  families: 'Familias',
  stock: 'Stock',
  users: 'Usuarios',
  stores: 'Tiendas',
  sales: 'Ventas',
  purchases: 'Compras',
  verifactu: 'VeriFactu',
};

function Home() {
  const logout = useAuthStore((s) => s.clear);
  const [tab, setTab] = useState<Tab>('dashboard');

  return (
    <div className="app-shell">
      <Sidebar items={NAV} groups={GROUPS} activeItem={tab} onSelect={(id) => setTab(id as Tab)} />
      <div className="app-content">
        <header className="bo-topbar">
          <div>
            <p className="bo-topbar-eyebrow">Administración</p>
            <h1 className="bo-topbar-title">{TAB_LABELS[tab]}</h1>
          </div>
          <button type="button" className="bo-topbar-logout" onClick={logout} data-testid="logout">
            Salir
          </button>
        </header>
        <main className="bo-main">
          {tab === 'dashboard' && <DashboardPage />}
          {tab === 'catalog' && <CatalogPage />}
          {tab === 'families' && <FamiliesPage />}
          {tab === 'stock' && <StockPage />}
          {tab === 'users' && <UsersPage />}
          {tab === 'stores' && <StoresPage />}
          {tab === 'sales' && <SalesHistoryPage />}
          {tab === 'purchases' && <PurchasesPage />}
          {tab === 'verifactu' && <VerifactuPage />}
        </main>
      </div>
    </div>
  );
}

function AccessDenied() {
  const logout = useAuthStore((s) => s.clear);
  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-[40rem] text-center" data-testid="access-denied">
        <h1 className="mb-2 text-2xl font-semibold">Acceso restringido</h1>
        <p className="mb-6 opacity-70">
          El backoffice es solo para administradores. Inicia sesión con una cuenta ADMIN.
        </p>
        <button onClick={logout} data-testid="logout" className="text-sm underline">
          Cerrar sesión
        </button>
      </div>
    </main>
  );
}

export default function App() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const getRole = useAuthStore((s) => s.getRole);
  if (accessToken === null) {
    return (
      <LoginForm onSubmit={api.login} title="simpleTPV Backoffice" subtitle="Administración" />
    );
  }
  if (getRole() !== 'ADMIN') {
    return <AccessDenied />;
  }
  return <Home />;
}
