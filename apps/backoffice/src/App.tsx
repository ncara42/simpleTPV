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

const LOGIN_KPIS = [
  { label: 'Ventas netas', value: '18.420 €', meta: '+12,4%', tone: 'up' },
  { label: 'Ticket medio', value: '38,60 €', meta: '+3,1%', tone: 'up' },
  { label: 'Margen', value: '41,8%', meta: 'Estable', tone: 'neutral' },
  { label: 'Stock crítico', value: '4', meta: 'Atención', tone: 'warn' },
] as const;

const LOGIN_STORES = [
  { name: 'Gran Vía', sales: '3.620 €', status: 'Abierta', progress: '94%' },
  { name: 'Centro', sales: '2.870 €', status: 'Abierta', progress: '81%' },
  { name: 'Norte', sales: '2.140 €', status: 'Cambio turno', progress: '68%' },
] as const;

function BackofficeLoginPanel() {
  return (
    <div className="bo-login-visual" aria-hidden="true">
      <div className="bo-login-brand">
        <span className="bo-login-mark">S</span>
        <span>
          <strong>simpleTPV</strong>
          <small>Administración</small>
        </span>
      </div>

      <div className="bo-login-preview">
        <div className="bo-login-window-bar">
          <div className="bo-login-window-dots">
            <span />
            <span />
            <span />
          </div>
          <div className="bo-login-window-title">Central · Backoffice</div>
          <div className="bo-login-window-tools">
            <span />
            <span />
          </div>
        </div>
        <div className="bo-login-preview-body">
          <aside className="bo-login-preview-sidebar">
            {NAV.slice(0, 7).map((item) => (
              <span key={item.id} className={item.id === 'dashboard' ? 'active' : undefined}>
                {item.icon}
                <small>{item.label}</small>
              </span>
            ))}
          </aside>

          <section className="bo-login-preview-main">
            <div className="bo-login-preview-head">
              <div>
                <small>Administración</small>
                <strong>Dashboard</strong>
              </div>
              <div className="bo-login-periods">
                <span className="active">Hoy</span>
                <span>Semana</span>
                <span>Mes</span>
              </div>
            </div>

            <div className="bo-login-kpis">
              {LOGIN_KPIS.map((kpi) => (
                <div key={kpi.label}>
                  <small>{kpi.label}</small>
                  <strong>{kpi.value}</strong>
                  <span className={`tone-${kpi.tone}`}>{kpi.meta}</span>
                </div>
              ))}
            </div>

            <div className="bo-login-workgrid">
              <section className="bo-login-panel bo-login-chart-panel">
                <div className="bo-login-panel-head">
                  <div>
                    <small>Rendimiento</small>
                    <strong>Ventas por franja</strong>
                  </div>
                  <span>+8,7%</span>
                </div>
                <svg className="bo-login-line-chart" viewBox="0 0 420 180" role="img">
                  <path
                    d="M18 146 C70 122 82 82 132 96 C176 108 190 46 236 58 C280 68 294 34 338 44 C370 51 388 36 406 28 L406 180 L18 180 Z"
                    className="bo-login-line-area"
                  />
                  <path
                    d="M18 146 C70 122 82 82 132 96 C176 108 190 46 236 58 C280 68 294 34 338 44 C370 51 388 36 406 28"
                    className="bo-login-line"
                  />
                  <g className="bo-login-line-points">
                    <circle cx="236" cy="58" r="4" />
                    <circle cx="338" cy="44" r="4" />
                    <circle cx="406" cy="28" r="4" />
                  </g>
                </svg>
                <div className="bo-login-chart-axis">
                  <span>10:00</span>
                  <span>14:00</span>
                  <span>18:00</span>
                  <span>22:00</span>
                </div>
              </section>

              <section className="bo-login-panel bo-login-ops-panel">
                <div className="bo-login-panel-head">
                  <div>
                    <small>Operativa</small>
                    <strong>Estado tiendas</strong>
                  </div>
                </div>
                <div className="bo-login-ops-list">
                  <span>
                    <Store size={14} />6 tiendas abiertas
                  </span>
                  <span>
                    <Package size={14} />
                    12 productos actualizados
                  </span>
                  <span>
                    <Users size={14} />
                    18 usuarios activos
                  </span>
                  <span>
                    <Receipt size={14} />
                    486 tickets emitidos
                  </span>
                </div>
              </section>

              <section className="bo-login-panel bo-login-store-panel">
                <div className="bo-login-panel-head">
                  <div>
                    <small>Tiendas</small>
                    <strong>Actividad destacada</strong>
                  </div>
                  <span>Hoy</span>
                </div>
                <div className="bo-login-store-table">
                  {LOGIN_STORES.map((store) => (
                    <div key={store.name} className="bo-login-store-row">
                      <span>
                        <strong>{store.name}</strong>
                        <small>{store.status}</small>
                      </span>
                      <span>{store.sales}</span>
                      <span className="bo-login-progress">
                        <i style={{ width: store.progress }} />
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </section>
        </div>
      </div>

      <div className="bo-login-status">
        <span>
          <BarChart2 size={16} />
          Operativa multitienda sincronizada
        </span>
        <span>Central · Admin</span>
      </div>
    </div>
  );
}

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
    return (
      <div className="bo-login">
        <LoginForm
          onSubmit={api.login}
          title="simpleTPV Backoffice"
          subtitle="Administración"
          leftPanel={<BackofficeLoginPanel />}
        />
      </div>
    );
  }
  if (getRole() !== 'ADMIN') {
    return <AccessDenied />;
  }
  return <Home />;
}
