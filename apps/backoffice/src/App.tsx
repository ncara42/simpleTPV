import '@simpletpv/ui/login.css';
import '@simpletpv/ui/select.css';
import '@simpletpv/ui/topbar.css';
import './catalog.css';
import './styles.css';

import { LoginForm, type NavItem, Sidebar, TopBar } from '@simpletpv/ui';
import {
  BarChart2,
  CheckSquare,
  LayoutDashboard,
  Package,
  Percent,
  Receipt,
  ShoppingCart,
  Store,
  Tag,
  Users,
} from 'lucide-react';
import { useState } from 'react';

import { CatalogPage } from './CatalogPage.js';
import { DashboardPage } from './DashboardPage.js';
import { DEMO_USER } from './demo/demoData.js';
import { FamiliesPage } from './FamiliesPage.js';
import { api, useAuthStore } from './lib/auth.js';
import { switchApp } from './lib/nav.js';
import { PromotionsPage } from './PromotionsPage.js';
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
  | 'promotions'
  | 'users'
  | 'stores'
  | 'sales'
  | 'purchases'
  | 'verifactu';

const ALL_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'catalog', label: 'Catálogo', icon: <Package size={18} /> },
  { id: 'families', label: 'Familias', icon: <Tag size={18} /> },
  { id: 'stock', label: 'Stock', icon: <BarChart2 size={18} /> },
  { id: 'promotions', label: 'Promociones', icon: <Percent size={18} /> },
  { id: 'users', label: 'Usuarios', icon: <Users size={18} /> },
  { id: 'stores', label: 'Tiendas', icon: <Store size={18} /> },
  { id: 'sales', label: 'Ventas', icon: <Receipt size={18} /> },
  { id: 'purchases', label: 'Compras', icon: <ShoppingCart size={18} /> },
  { id: 'verifactu', label: 'VeriFactu', icon: <CheckSquare size={18} /> },
];

// #106: Compras y VeriFactu se retiran del menú (decisión informe UX 2026-06-02).
// El código (páginas, lib y datos demo) se conserva para una posible reactivación
// futura: basta con quitar el id de este set para que vuelvan a aparecer.
const HIDDEN_TABS = new Set<Tab>(['purchases', 'verifactu']);
const NAV: NavItem[] = ALL_NAV.filter((item) => !HIDDEN_TABS.has(item.id as Tab));

function Home() {
  const logout = useAuthStore((s) => s.clear);
  const [tab, setTab] = useState<Tab>('dashboard');

  return (
    <div className="app-shell">
      <Sidebar
        items={NAV}
        activeItem={tab}
        onSelect={(id) => setTab(id as Tab)}
        account={{ name: DEMO_USER.name, subtitle: 'Central · Admin' }}
        onLogout={logout}
      />
      <div className="app-content">
        <TopBar eyebrow="Administración" activeApp="backoffice" onSwitchApp={switchApp} />
        <main className="bo-main">
          {tab === 'dashboard' && <DashboardPage />}
          {tab === 'catalog' && <CatalogPage />}
          {tab === 'families' && <FamiliesPage />}
          {tab === 'stock' && <StockPage />}
          {tab === 'promotions' && <PromotionsPage />}
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
    return <LoginForm onSubmit={api.login} />;
  }
  if (getRole() !== 'ADMIN') {
    return <AccessDenied />;
  }
  return <Home />;
}
