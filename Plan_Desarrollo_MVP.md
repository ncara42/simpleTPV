# Plan de Desarrollo — TPV Multitienda MVP

| Campo | Valor |
|---|---|
| **Proyecto** | TPV Multitienda para Retail CBD |
| **Fecha inicio estimada** | 2 junio 2026 |
| **Duración MVP** | 8 semanas (40 días laborables) |
| **Equipo** | 2 desarrolladores (Dev 1: Backend/Infra, Dev 2: Frontend/UX) |
| **Documento de referencia** | PRD v1.0 (27 mayo 2026) |

---

## 1. Stack tecnológico

### 1.1 Decisiones de stack y justificación

| Capa | Tecnología | Versión | Justificación |
|---|---|---|---|
| **Lenguaje** | TypeScript | 5.x | Tipado end-to-end (back + front), reduce errores, un solo lenguaje para el equipo |
| **Backend API** | NestJS | 11.x | Framework estructurado (módulos, inyección de dependencias, guards), ideal para API REST con roles/permisos. Gran ecosistema. |
| **ORM** | Prisma | 6.x | Migraciones declarativas, type-safe queries, excelente DX con TypeScript |
| **Base de datos** | PostgreSQL | 16 | Transaccional, JSONB para flexibilidad, excelente para queries analíticas (dashboards) |
| **Cache / Sesiones** | Redis | 7.x | Cache de stock en tiempo real, sesiones de caja, pub/sub para notificaciones entre servicios |
| **Frontend TPV** | React + Vite | React 19 + Vite 6 | SPA online-only en MVP. Offline como módulo post-MVP |
| **Frontend Backoffice** | React + Vite | React 19 + Vite 6 | Mismo stack que TPV para compartir componentes y conocimiento |
| **UI Components** | Mantine | 7.x | Componentes enterprise-ready, buen soporte de tablas/formularios/modales, tema oscuro, accesible |
| **State management** | Zustand + TanStack Query | Zustand 5 + TQ 5 | Zustand: estado local ligero. TanStack Query: cache de server state, refetch, offline |
| **Gráficas** | Recharts | 2.x | Ligera, declarativa, buena para dashboards operativos |
| **Autenticación** | JWT + bcrypt | - | Access token (15min) + refresh token (7d). PIN rápido para cambio de turno |
| **Validación** | Zod | 3.x | Esquemas compartidos back/front, validación en runtime |
| **Escáner de código de barras** | quagga2 / Web API | - | Lectura por cámara (tablet) o input de escáner USB (se comporta como teclado) |
| **Impresión de tickets** | ESC/POS via WebUSB o servidor de impresión | - | Compatibilidad con impresoras térmicas estándar |
| **Containerización** | Docker + Docker Compose | - | Entornos reproducibles, despliegue simplificado |
| **Proxy inverso** | Nginx | 1.27 | Routing, SSL termination, servir estáticos |
| **CI/CD** | GitHub Actions | - | Build, test, deploy automatizado |
| **Hosting producción** | VPS (Hetzner / DigitalOcean) | - | Coste bajo para MVP, Docker Compose en producción. Migrar a Kubernetes si escala. |
| **Monitorización** | Sentry + Prometheus + Grafana | - | Errores (Sentry), métricas de sistema (Prometheus), dashboards ops (Grafana) |
| **Tests** | Vitest + Playwright | - | Vitest: unit/integration. Playwright: e2e del flujo de venta |

### 1.2 Decisiones clave de arquitectura

> [!IMPORTANT]
> **Monorepo con Turborepo**: Un solo repositorio con workspaces para compartir tipos, validaciones y utilidades entre backend y frontends.

**Multi-tenant (desde el día 1):**
- Estrategia: shared database + shared schema + `organization_id` en todas las tablas + **Row-Level Security** de PostgreSQL.
- Middleware del API lee `organization_id` del JWT y ejecuta `SET LOCAL app.current_organization_id = ...` al inicio de cada transacción.
- Políticas RLS sobre cada tabla con `organization_id` impiden lecturas cruzadas incluso ante un bug del API.
- Tests automatizados verifican aislamiento: token de org A no puede leer datos de org B.

**Arquitectura modular:**
- Core mínimo (TPV, stock, traspasos, catálogo, dashboards, auditoría, VeriFactu).
- Módulos opcionales activables por tenant vía tabla `ModuleSubscription`.
- Cada módulo registra rutas API, entidades propias (con prefijo de tabla, ej: `loyalty_customer`) y elementos de UI.
- Módulos consumen eventos del core vía Redis pub/sub. **No modifican el core.**

**Estrategia de tiempo real (sin offline en MVP):**
- PostgreSQL es la fuente de verdad. Cada venta/traspaso/ajuste actualiza la BD en transacción ACID.
- Trigger publica evento en Redis pub/sub (`tenant:{id}:stock`, `tenant:{id}:sale`).
- **API distribuye los eventos por SSE tanto al backoffice como al TPV** (sustituye al polling 30s previsto antes). El cliente filtra los eventos del tenant al que pertenece.
- Cuando un TPV pierde conexión SSE: el cliente intenta reconectar con backoff. Si la API no responde en 3s, el TPV bloquea el cobro y muestra estado degradado.

**Conectividad y degradación:**
- MVP **online-only**. Onboarding del cliente incluye **router 4G de respaldo obligatorio**.
- Health-check del TPV (`/api/health` cada 10s). Si falla, banner rojo visible y cobro bloqueado.
- Offline real entra como módulo `mod.offline` post-MVP (Service Worker + IndexedDB + sync con resolución de conflictos).

---

## 2. Arquitectura de contenedores

### 2.1 Diagrama de servicios

```mermaid
graph TB
    subgraph Internet
        USER_TPV["Tablet / PC Tienda"]
        USER_BO["PC Central / Admin"]
    end

    subgraph Docker_Host["Docker Host - VPS"]
        NGINX["nginx - Puerto 80/443 - Reverse Proxy + SSL"]
        
        subgraph App_Containers["Contenedores de aplicacion"]
            API["api - NestJS - Puerto 3000 - Backend REST + SSE"]
            TPV_FRONT["tpv-frontend - Nginx static - Puerto 8080 - React SPA"]
            BO_FRONT["backoffice-frontend - Nginx static - Puerto 8081 - React SPA"]
        end
        
        subgraph Data_Containers["Contenedores de datos"]
            POSTGRES["postgres - Puerto 5432 - PostgreSQL 16 - Volume: pgdata"]
            REDIS["redis - Puerto 6379 - Redis 7 - Volume: redisdata"]
        end
        
        subgraph Monitoring["Monitoring - opcional semana 5"]
            SENTRY["sentry - self-hosted o cloud"]
        end
    end

    USER_TPV --> NGINX
    USER_BO --> NGINX
    NGINX -->|"/api/*"| API
    NGINX -->|"/tpv/*"| TPV_FRONT
    NGINX -->|"/ y /backoffice/*"| BO_FRONT
    API --> POSTGRES
    API --> REDIS
```

### 2.2 Docker Compose - servicios y relaciones

```yaml
# docker-compose.yml (estructura conceptual)
version: "3.9"

services:
  # ── Base de datos ──────────────────────────────
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: tpv_multitienda
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"           # Solo expuesto en dev
    networks:
      - backend
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 5s
      retries: 5

  # ── Cache y pub/sub ────────────────────────────
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redisdata:/data
    ports:
      - "6379:6379"           # Solo expuesto en dev
    networks:
      - backend
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 5

  # ── Backend API ────────────────────────────────
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    environment:
      DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/tpv_multitienda
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      NODE_ENV: production
    ports:
      - "3000:3000"
    networks:
      - backend
      - frontend
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  # ── Frontend TPV (PWA) ─────────────────────────
  tpv-frontend:
    build:
      context: .
      dockerfile: apps/tpv/Dockerfile
    ports:
      - "8080:80"
    networks:
      - frontend

  # ── Frontend Backoffice ────────────────────────
  backoffice-frontend:
    build:
      context: .
      dockerfile: apps/backoffice/Dockerfile
    ports:
      - "8081:80"
    networks:
      - frontend

  # ── Reverse Proxy ──────────────────────────────
  nginx:
    image: nginx:1.27-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./infra/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./infra/nginx/certs:/etc/nginx/certs:ro
    networks:
      - frontend
    depends_on:
      - api
      - tpv-frontend
      - backoffice-frontend

networks:
  backend:
    driver: bridge    # Solo api <-> postgres/redis
  frontend:
    driver: bridge    # nginx <-> api/frontends

volumes:
  pgdata:
  redisdata:
```

### 2.3 Relación entre contenedores

| Origen | Destino | Protocolo | Red | Descripción |
|---|---|---|---|---|
| `nginx` | `tpv-frontend` | HTTP | frontend | Sirve la PWA del TPV (archivos estáticos) |
| `nginx` | `backoffice-frontend` | HTTP | frontend | Sirve el backoffice (archivos estáticos) |
| `nginx` | `api` | HTTP | frontend | Proxy inverso: `/api/*` se reenvía al backend |
| `api` | `postgres` | TCP/5432 | backend | Queries SQL via Prisma |
| `api` | `redis` | TCP/6379 | backend | Cache de stock, sesiones, pub/sub de eventos |
| `tpv-frontend` | `api` | HTTP (vía nginx) | - | Llamadas REST desde el navegador |
| `backoffice-frontend` | `api` | HTTP + SSE (vía nginx) | - | REST + Server-Sent Events para tiempo real |

> [!NOTE]
> **Dos redes Docker separadas** (`backend` y `frontend`) para que los frontends no puedan acceder directamente a PostgreSQL o Redis. Solo `api` está en ambas redes.

### 2.4 Nginx - routing

```nginx
# Estructura conceptual de nginx.conf
upstream api_backend {
    server api:3000;
}

server {
    listen 80;
    server_name tpv.ejemplo.com;

    # API backend
    location /api/ {
        proxy_pass http://api_backend/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # SSE support
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        chunked_transfer_encoding off;
        proxy_buffering off;
        proxy_cache off;
    }

    # TPV frontend (PWA)
    location /tpv/ {
        proxy_pass http://tpv-frontend:80/;
    }

    # Backoffice frontend (default)
    location / {
        proxy_pass http://backoffice-frontend:80/;
    }
}
```

---

## 3. Estructura del monorepo

```
tpv-multitienda/
|
|-- package.json                    # Workspace root
|-- turbo.json                      # Turborepo config
|-- docker-compose.yml
|-- docker-compose.dev.yml
|-- .github/
|   |-- workflows/
|       |-- ci.yml                  # Lint + test + build
|       |-- deploy.yml              # Deploy a VPS
|
|-- packages/
|   |-- shared-types/               # Tipos TS compartidos
|   |   |-- src/
|   |   |   |-- models/             # Product, Sale, Stock, Transfer...
|   |   |   |-- api/                # Request/Response DTOs
|   |   |   |-- enums/              # PaymentMethod, TransferStatus...
|   |   |-- package.json
|   |
|   |-- shared-validators/          # Esquemas Zod compartidos
|   |   |-- src/
|   |   |   |-- product.schema.ts
|   |   |   |-- sale.schema.ts
|   |   |   |-- stock.schema.ts
|   |   |-- package.json
|   |
|   |-- shared-utils/               # Funciones comunes
|       |-- src/
|       |   |-- currency.ts          # Formateo de precios
|       |   |-- date.ts              # Helpers de fecha
|       |   |-- barcode.ts           # Validación de EAN
|       |-- package.json
|
|-- apps/
|   |-- api/                         # NestJS Backend
|   |   |-- src/
|   |   |   |-- main.ts
|   |   |   |-- app.module.ts
|   |   |   |-- common/
|   |   |   |   |-- guards/          # AuthGuard, RolesGuard
|   |   |   |   |-- decorators/      # @Roles, @CurrentUser
|   |   |   |   |-- filters/         # HttpExceptionFilter
|   |   |   |   |-- interceptors/    # LoggingInterceptor, AuditInterceptor
|   |   |   |-- modules/
|   |   |   |   |-- auth/            # Login, JWT, PIN, refresh
|   |   |   |   |-- users/           # CRUD usuarios, roles
|   |   |   |   |-- stores/          # CRUD tiendas
|   |   |   |   |-- products/        # Catálogo, familias
|   |   |   |   |-- stock/           # Stock, alertas, movimientos
|   |   |   |   |-- sales/           # Ventas, líneas, devoluciones
|   |   |   |   |-- transfers/       # Traspasos central -> tienda
|   |   |   |   |-- purchases/       # Pedidos a proveedor
|   |   |   |   |-- cash-sessions/   # Apertura/cierre de caja
|   |   |   |   |-- dashboard/       # Endpoints de analítica
|   |   |   |   |-- events/          # SSE multiplexado por tenant
|   |   |   |   |-- modules/         # Catálogo + activación de módulos por tenant
|   |   |   |   |-- verifactu/       # Cumplimiento legal: cola, encadenamiento, QR
|   |   |   |   |-- tenancy/         # Middleware RLS, contexto multi-tenant
|   |   |   |   |-- audit/           # Log inmutable de eventos
|   |   |   |-- prisma/
|   |   |       |-- schema.prisma
|   |   |       |-- migrations/
|   |   |       |-- seed.ts
|   |   |-- Dockerfile
|   |   |-- package.json
|   |
|   |-- tpv/                         # React SPA - Punto de venta (online-only en MVP)
|   |   |-- src/
|   |   |   |-- main.tsx
|   |   |   |-- App.tsx
|   |   |   |-- pages/
|   |   |   |   |-- LoginPage.tsx
|   |   |   |   |-- SalePage.tsx     # Pantalla principal de venta
|   |   |   |   |-- ReturnPage.tsx
|   |   |   |   |-- StockPage.tsx
|   |   |   |   |-- CashClosePage.tsx
|   |   |   |-- components/
|   |   |   |   |-- ProductSearch/
|   |   |   |   |-- Cart/
|   |   |   |   |-- PaymentModal/
|   |   |   |   |-- BarcodeScanner/
|   |   |   |   |-- TicketPreview/
|   |   |   |-- hooks/
|   |   |   |   |-- useProducts.ts
|   |   |   |   |-- useCart.ts
|   |   |   |   |-- useSale.ts
|   |   |   |   |-- useBarcode.ts
|   |   |   |-- stores/              # Zustand stores
|   |   |   |   |-- cartStore.ts
|   |   |   |   |-- authStore.ts
|   |   |   |-- api/                 # TanStack Query hooks
|   |   |       |-- client.ts
|   |   |       |-- products.api.ts
|   |   |       |-- sales.api.ts
|   |   |-- vite.config.ts
|   |   |-- Dockerfile
|   |   |-- package.json
|   |
|   |-- backoffice/                   # React SPA - Central/Admin
|       |-- src/
|       |   |-- main.tsx
|       |   |-- App.tsx
|       |   |-- pages/
|       |   |   |-- DashboardPage.tsx
|       |   |   |-- ProductsPage.tsx
|       |   |   |-- StockPage.tsx
|       |   |   |-- TransfersPage.tsx
|       |   |   |-- PurchasesPage.tsx
|       |   |   |-- UsersPage.tsx
|       |   |   |-- StoresPage.tsx
|       |   |-- components/
|       |   |   |-- charts/
|       |   |   |-- tables/
|       |   |   |-- forms/
|       |   |-- api/
|       |-- vite.config.ts
|       |-- Dockerfile
|       |-- package.json
|
|-- infra/
    |-- nginx/
    |   |-- nginx.conf
    |   |-- nginx.dev.conf
    |-- scripts/
        |-- deploy.sh
        |-- backup-db.sh
        |-- seed-demo.sh
```

---

## 4. Esquema de base de datos (Prisma)

### 4.1 Modelo completo (se construye incrementalmente por semanas)

```prisma
// schema.prisma - Modelo completo del MVP

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ── Organización y tiendas ─────────────────────

model Organization {
  id        String   @id @default(uuid())
  name      String
  nif       String?  @unique
  country   String   @default("ES")        // ISO 3166-1 alpha-2
  locale    String   @default("es-ES")
  currency  String   @default("EUR")       // ISO 4217
  createdAt DateTime @default(now())

  stores              Store[]
  users               User[]
  products            Product[]
  productFamilies     ProductFamily[]
  suppliers           Supplier[]
  moduleSubscriptions ModuleSubscription[]
}

// ── Módulos opcionales activables por tenant ───
// Permite vender el core estable y añadir módulos sin tocar code path principal.

model Module {
  code         String   @id           // "mod.loyalty", "mod.hr", "mod.offline", ...
  name         String
  description  String
  monthlyPrice Decimal  @db.Decimal(10, 2)
  active       Boolean  @default(true) // si false, no se ofrece a nuevos clientes

  subscriptions ModuleSubscription[]
}

model ModuleSubscription {
  id             String              @id @default(uuid())
  organizationId String
  moduleCode     String
  status         SubscriptionStatus  @default(ACTIVE)
  startedAt      DateTime            @default(now())
  endsAt         DateTime?
  priceOverride  Decimal?            @db.Decimal(10, 2)

  organization   Organization @relation(fields: [organizationId], references: [id])
  module         Module       @relation(fields: [moduleCode], references: [code])

  @@unique([organizationId, moduleCode])
  @@index([organizationId])
}

enum SubscriptionStatus {
  ACTIVE
  SUSPENDED
  CANCELLED
}

model Store {
  id             String       @id @default(uuid())
  organizationId String
  name           String
  address        String?
  type           StoreType    @default(STORE)
  active         Boolean      @default(true)
  createdAt      DateTime     @default(now())

  organization   Organization @relation(fields: [organizationId], references: [id])
  users          UserStore[]
  stocks         Stock[]
  sales          Sale[]
  cashSessions   CashSession[]
  transfersIn    Transfer[]   @relation("TransferDestination")
  transfersOut   Transfer[]   @relation("TransferOrigin")
  stockAlerts    StockAlert[]
}

enum StoreType {
  STORE
  WAREHOUSE
}

// ── Usuarios y autenticación ───────────────────

model User {
  id             String   @id @default(uuid())
  organizationId String
  email          String   @unique
  name           String
  passwordHash   String
  pin            String?          // PIN de 4 dígitos (hash)
  role           UserRole
  active         Boolean  @default(true)
  createdAt      DateTime @default(now())

  organization   Organization @relation(fields: [organizationId], references: [id])
  stores         UserStore[]
  sales          Sale[]
  cashSessions   CashSession[]
  stockMovements StockMovement[]
  auditLogs      AuditLog[]
}

model UserStore {
  userId  String
  storeId String
  user    User  @relation(fields: [userId], references: [id])
  store   Store @relation(fields: [storeId], references: [id])

  @@id([userId, storeId])
}

enum UserRole {
  ADMIN       // Central / Jefe
  MANAGER     // Responsable de tienda
  CLERK       // Dependiente
}

// ── Catálogo ───────────────────────────────────

model ProductFamily {
  id             String   @id @default(uuid())
  organizationId String
  name           String
  icon           String?
  color          String?
  parentId       String?
  sortOrder      Int      @default(0)

  organization   Organization   @relation(fields: [organizationId], references: [id])
  parent         ProductFamily? @relation("FamilyHierarchy", fields: [parentId], references: [id])
  children       ProductFamily[] @relation("FamilyHierarchy")
  products       Product[]
}

model Product {
  id             String      @id @default(uuid())
  organizationId String
  familyId       String?
  name           String
  description    String?
  barcode        String?
  sku            String?                                    // SKU interno del cliente
  saleUnit       SaleUnit    @default(UNIT)                 // UNIT, WEIGHT, VOLUME, LENGTH
  unitSymbol     String      @default("ud")                 // "ud", "kg", "g", "l", "ml", "m"...
  salePrice      Decimal     @db.Decimal(10, 4)             // 4 decimales para granel
  costPrice      Decimal     @db.Decimal(10, 4)
  taxRate        Decimal     @default(21) @db.Decimal(5, 2) // IVA % aplicable
  imageUrl       String?
  active         Boolean     @default(true)
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  organization   Organization        @relation(fields: [organizationId], references: [id])
  family         ProductFamily?      @relation(fields: [familyId], references: [id])
  stocks         Stock[]
  saleLines      SaleLine[]
  returnLines    ReturnLine[]
  transferLines  TransferLine[]
  poLines        PurchaseOrderLine[]
  stockMovements StockMovement[]
  stockAlerts    StockAlert[]

  // Barcode único por organización (no global)
  @@unique([organizationId, barcode])
  @@index([organizationId, active])
  @@index([organizationId, familyId])
}

enum SaleUnit {
  UNIT     // pieza
  WEIGHT   // por kg, g
  VOLUME   // por l, ml
  LENGTH   // por m, cm
}

// ── Stock ──────────────────────────────────────

model Stock {
  id             String   @id @default(uuid())
  organizationId String
  productId      String
  storeId        String
  quantity       Decimal  @default(0) @db.Decimal(12, 3) // soporta granel
  minStock       Decimal  @default(0) @db.Decimal(12, 3)
  updatedAt      DateTime @updatedAt

  product   Product @relation(fields: [productId], references: [id])
  store     Store   @relation(fields: [storeId], references: [id])

  @@unique([productId, storeId])
  @@index([organizationId, storeId])
}

model StockMovement {
  id             String       @id @default(uuid())
  organizationId String
  productId      String
  storeId        String
  userId         String?
  type           MovementType
  quantity       Decimal      @db.Decimal(12, 3) // positivo = entrada, negativo = salida
  referenceId    String?                          // ID de venta/traspaso/pedido/ajuste
  reason         String?
  createdAt      DateTime     @default(now())

  product     Product  @relation(fields: [productId], references: [id])
  user        User?    @relation(fields: [userId], references: [id])

  @@index([organizationId, productId, createdAt])
  @@index([organizationId, storeId, createdAt])
}

enum MovementType {
  SALE
  RETURN
  TRANSFER_IN
  TRANSFER_OUT
  PURCHASE_RECEIPT
  ADJUSTMENT
}

model StockAlert {
  id             String    @id @default(uuid())
  organizationId String
  productId      String
  storeId        String
  alertType      AlertType
  resolved       Boolean   @default(false)
  resolvedAt     DateTime?
  createdAt      DateTime  @default(now())

  product    Product @relation(fields: [productId], references: [id])
  store      Store   @relation(fields: [storeId], references: [id])

  @@index([organizationId, resolved, createdAt])
}

enum AlertType {
  LOW_STOCK       // Por debajo de minStock
  OUT_OF_STOCK    // Stock = 0
}

// ── Ventas ─────────────────────────────────────

model Sale {
  id             String        @id @default(uuid())
  organizationId String
  ticketNumber   String                                    // Único por organización, no global
  storeId        String
  userId         String
  customerNif    String?                                   // NIF/CIF opcional para tickets con identificación
  subtotal       Decimal       @db.Decimal(10, 2)         // Suma de líneas SIN IVA, SIN descuento
  discountTotal  Decimal       @default(0) @db.Decimal(10, 2)
  taxableBase    Decimal       @db.Decimal(10, 2)         // base imponible final (subtotal − descuento)
  taxTotal       Decimal       @default(0) @db.Decimal(10, 2)
  total          Decimal       @db.Decimal(10, 2)         // taxableBase + taxTotal
  paymentMethod  PaymentMethod
  cashGiven      Decimal?      @db.Decimal(10, 2)
  cashChange     Decimal?      @db.Decimal(10, 2)
  status         SaleStatus    @default(COMPLETED)
  startedAt      DateTime      @default(now())
  completedAt    DateTime      @default(now())

  // ── VeriFactu / cumplimiento ──
  verifactuHash  String?                                  // huella encadenada
  verifactuPrev  String?                                  // hash del registro anterior (cadena)
  verifactuQr    String?                                  // contenido del QR del ticket
  verifactuSent  Boolean       @default(false)
  verifactuSentAt DateTime?

  store          Store     @relation(fields: [storeId], references: [id])
  user           User      @relation(fields: [userId], references: [id])
  lines          SaleLine[]
  returns        Return[]
  taxBreakdown   SaleTaxBreakdown[]

  @@unique([organizationId, ticketNumber])
  @@index([organizationId, storeId, completedAt])
  @@index([organizationId, completedAt])
}

model SaleLine {
  id             String  @id @default(uuid())
  organizationId String
  saleId         String
  productId      String
  productName    String                                   // snapshot del nombre
  quantity       Decimal @db.Decimal(12, 3)              // soporta granel
  unitPrice      Decimal @db.Decimal(10, 4)
  taxRate        Decimal @db.Decimal(5, 2)                // snapshot del tipo de IVA
  discountPct    Decimal @default(0) @db.Decimal(5, 2)
  discountAmt    Decimal @default(0) @db.Decimal(10, 2)
  taxableBase    Decimal @db.Decimal(10, 2)               // (qty * unitPrice) − discountAmt, sin IVA
  taxAmount      Decimal @db.Decimal(10, 2)               // IVA de la línea
  subtotal       Decimal @db.Decimal(10, 2)               // taxableBase + taxAmount

  sale          Sale    @relation(fields: [saleId], references: [id])
  product       Product @relation(fields: [productId], references: [id])

  @@index([organizationId, saleId])
}

// Desglose de IVA agregado por tipo, exigido para tickets/facturas conformes a la AEAT
model SaleTaxBreakdown {
  id             String  @id @default(uuid())
  organizationId String
  saleId         String
  taxRate        Decimal @db.Decimal(5, 2)
  taxableBase    Decimal @db.Decimal(10, 2)
  taxAmount      Decimal @db.Decimal(10, 2)

  sale           Sale @relation(fields: [saleId], references: [id])

  @@unique([saleId, taxRate])
}

enum PaymentMethod {
  CASH
  CARD
  MIXED
}

enum SaleStatus {
  COMPLETED
  VOIDED
  PARKED
}

// ── Devoluciones ───────────────────────────────

model Return {
  id             String        @id @default(uuid())
  organizationId String
  storeId        String
  saleId         String?                                   // null si es devolución sin ticket
  withoutTicket  Boolean       @default(false)
  authorizedBy   String?                                   // userId del MANAGER que autorizó si es sin ticket
  reason         String
  notes          String?
  total          Decimal       @db.Decimal(10, 2)
  taxTotal       Decimal       @default(0) @db.Decimal(10, 2)
  createdAt      DateTime      @default(now())

  // ── VeriFactu (nota de abono) ──
  verifactuHash  String?
  verifactuPrev  String?
  verifactuSent  Boolean       @default(false)
  verifactuSentAt DateTime?

  sale       Sale?        @relation(fields: [saleId], references: [id])
  lines      ReturnLine[]

  @@index([organizationId, storeId, createdAt])
}

model ReturnLine {
  id             String  @id @default(uuid())
  organizationId String
  returnId       String
  productId      String
  quantity       Decimal @db.Decimal(12, 3)
  unitPrice      Decimal @db.Decimal(10, 4)
  taxRate        Decimal @db.Decimal(5, 2)
  taxableBase    Decimal @db.Decimal(10, 2)
  taxAmount      Decimal @db.Decimal(10, 2)
  subtotal       Decimal @db.Decimal(10, 2)

  return     Return  @relation(fields: [returnId], references: [id])
  product    Product @relation(fields: [productId], references: [id])
}

// ── Traspasos ──────────────────────────────────

model Transfer {
  id              String         @id @default(uuid())
  organizationId  String
  originStoreId   String
  destStoreId     String
  status          TransferStatus @default(DRAFT)
  notes           String?
  createdBy       String
  createdAt       DateTime       @default(now())
  sentAt          DateTime?
  receivedAt      DateTime?
  closedAt        DateTime?

  originStore     Store          @relation("TransferOrigin", fields: [originStoreId], references: [id])
  destStore       Store          @relation("TransferDestination", fields: [destStoreId], references: [id])
  lines           TransferLine[]

  @@index([organizationId, status, createdAt])
}

model TransferLine {
  id               String   @id @default(uuid())
  organizationId   String
  transferId       String
  productId        String
  quantitySent     Decimal  @db.Decimal(12, 3)
  quantityReceived Decimal? @db.Decimal(12, 3) // null = no recibido aún
  discrepancy      Decimal? @db.Decimal(12, 3) // recibido - enviado
  discrepancyNote  String?

  transfer        Transfer @relation(fields: [transferId], references: [id])
  product         Product  @relation(fields: [productId], references: [id])
}

enum TransferStatus {
  DRAFT
  SENT
  RECEIVED
  CLOSED
}

// ── Compras / Proveedor ────────────────────────

model Supplier {
  id             String   @id @default(uuid())
  organizationId String
  name           String
  email          String?
  phone          String?

  organization   Organization    @relation(fields: [organizationId], references: [id])
  purchaseOrders PurchaseOrder[]
}

model PurchaseOrder {
  id           String       @id @default(uuid())
  supplierId   String
  status       POStatus     @default(DRAFT)
  notes        String?
  expectedDate DateTime?
  createdAt    DateTime     @default(now())
  confirmedAt  DateTime?
  receivedAt   DateTime?

  supplier     Supplier             @relation(fields: [supplierId], references: [id])
  lines        PurchaseOrderLine[]
}

model PurchaseOrderLine {
  id               String   @id @default(uuid())
  organizationId   String
  purchaseOrderId  String
  productId        String
  quantityOrdered  Decimal  @db.Decimal(12, 3)
  quantityReceived Decimal? @db.Decimal(12, 3)
  unitCost         Decimal  @db.Decimal(10, 4)

  purchaseOrder    PurchaseOrder @relation(fields: [purchaseOrderId], references: [id])
  product          Product       @relation(fields: [productId], references: [id])
}

enum POStatus {
  DRAFT
  CONFIRMED
  PARTIALLY_RECEIVED
  RECEIVED
}

// ── Sesiones de caja ───────────────────────────

model CashSession {
  id             String    @id @default(uuid())
  organizationId String
  storeId        String
  userId         String
  openedAt       DateTime  @default(now())
  closedAt       DateTime?
  openingCash    Decimal   @db.Decimal(10, 2)
  expectedCash   Decimal?  @db.Decimal(10, 2)
  countedCash    Decimal?  @db.Decimal(10, 2)
  discrepancy    Decimal?  @db.Decimal(10, 2)
  discrepancyNote String?
  totalSales     Decimal?  @db.Decimal(10, 2)
  totalReturns   Decimal?  @db.Decimal(10, 2)
  totalCard      Decimal?  @db.Decimal(10, 2)
  totalCash      Decimal?  @db.Decimal(10, 2)

  store          Store @relation(fields: [storeId], references: [id])
  user           User  @relation(fields: [userId], references: [id])
}

// ── Auditoría ──────────────────────────────────

model AuditLog {
  id             String   @id @default(uuid())
  organizationId String
  userId         String?
  action         String                                // SALE_CREATED, STOCK_ADJUSTED, PRICE_CHANGED...
  entity         String                                // Sale, Product, Stock...
  entityId       String
  oldValue       Json?
  newValue       Json?
  ipAddress      String?
  createdAt      DateTime @default(now())

  user       User? @relation(fields: [userId], references: [id])

  @@index([organizationId, entity, entityId])
  @@index([organizationId, createdAt])
}

// ── Política RLS (en migración SQL, no expresable en Prisma) ───
//
// Se aplica una política de Row-Level Security a cada tabla con organizationId.
// Ejemplo para "products":
//
//   ALTER TABLE products ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY products_tenant_isolation ON products
//     USING (organization_id = current_setting('app.current_organization_id')::uuid);
//
// El API ejecuta antes de cada query:
//   SET LOCAL app.current_organization_id = '<uuid del JWT>';
//
// Tests automatizados verifican que un token de org A no puede leer datos de org B.
```

---

## 5. Plan semana a semana

---

### Semana 0 — Alineación y base técnica (3 días: lun-mié)

**Objetivo:** Infraestructura lista, entorno de desarrollo funcional, modelo de datos multi-tenant validado, hardware del piloto definido.

#### Dev 1 (Backend / Infra)

| Día | Tarea | Entregable |
|---|---|---|
| L | Inicializar monorepo (Turborepo + workspaces), configurar ESLint, Prettier, tsconfig compartido | Repo con `packages/` y `apps/` funcional, `turbo build` pasa |
| L | Crear `apps/api` con NestJS, configurar Prisma, conectar PostgreSQL | `npm run dev` del API arranca y conecta a DB |
| M | Crear `docker-compose.yml` y `docker-compose.dev.yml` con todos los servicios | `docker compose up` levanta postgres + redis + api |
| M | Definir esquema Prisma completo (todas las tablas con `organizationId`, `Module`, `ModuleSubscription`, VeriFactu fields), ejecutar primera migración | Migración `001_initial` aplicada |
| M | Migración SQL adicional: habilitar RLS sobre todas las tablas con `organizationId` y crear políticas de aislamiento | Migración `002_rls` aplicada. Test manual con dos orgs verifica aislamiento |
| X | Crear `packages/shared-types` y `packages/shared-validators` con tipos y esquemas Zod del catálogo y ventas | Paquetes importables desde api y frontends |
| X | Crear seed script multi-tenant: 2 organizaciones distintas, cada una con sus familias, productos, tiendas, usuarios | `npx prisma db seed` puebla datos realistas multi-tenant |

#### Dev 2 (Frontend / UX)

| Día | Tarea | Entregable |
|---|---|---|
| L | Workshop con design partner: mapear flujo real de venta paso a paso, fotografiar disposición de tienda | Documento con flujo de venta anotado (6-10 pasos) |
| L | **Validación de hardware con design partner**: definir modelos exactos de tablet, escáner USB/BT, impresora térmica 80mm, router 4G. Verificar disponibilidad y precios. Comprar 1 set para desarrollo | Documento `hardware-stack.md` con modelos, precios y proveedor |
| L | Definir modelo de catálogo con design partner: familias, variantes, códigos de barras existentes, productos a granel | Lista de familias + muestra de 20 productos reales (al menos 2 a granel) |
| M | Crear `apps/tpv` con Vite + React + Mantine, configurar tema visual | App TPV arranca con layout base y tema aplicado |
| M | Crear `apps/backoffice` con Vite + React + Mantine, configurar routing (React Router) | App Backoffice arranca con sidebar + routing |
| X | Diseñar wireframes de pantalla principal de venta (layout de búsqueda + carrito + cobro) | Wireframe validado, layout implementado en componente vacío |
| X | Cliente API base con interceptor que añade JWT y maneja errores 401 → refresh | Cliente reutilizable |

#### Criterios de completitud Semana 0

- [ ] `docker compose up` levanta todo el stack (postgres, redis, api, tpv, backoffice)
- [ ] Base de datos con todas las tablas, RLS habilitado y datos seed multi-tenant
- [ ] **Test de aislamiento multi-tenant pasa**: con conexión a org A, no se ven datos de org B
- [ ] Ambos frontends arrancan y muestran layout base
- [ ] Tipos compartidos importables en los 3 proyectos
- [ ] Documento de flujo de venta del design partner completado
- [ ] **Stack de hardware definido, comprado y listo en mesa de desarrollo**

---

### Semana 1 — Autenticación + Catálogo + Búsqueda de producto

**Objetivo:** Login funcional, catálogo CRUD en backoffice, búsqueda de producto operativa en TPV.

#### Dev 1 (Backend)

| Día | Tarea | Entregable |
|---|---|---|
| L | Módulo `auth`: registro, login (email+password), JWT access+refresh tokens. JWT contiene `organizationId` y `role` | `POST /auth/login`, `POST /auth/refresh` funcionando |
| L | Guards: `AuthGuard` (JWT), `RolesGuard` (RBAC), `TenantContextInterceptor` que ejecuta `SET LOCAL app.current_organization_id` antes de cada query | Endpoints protegidos por rol y aislados por tenant. Test pasa: usuario org A no ve productos de org B aunque API tenga bug |
| M | Módulo `users`: CRUD usuarios, asignación de tiendas, cambio de PIN | Endpoints `/users` con RBAC (solo ADMIN) |
| M | Módulo `stores`: CRUD tiendas | Endpoints `/stores` |
| X | Módulo `products`: CRUD productos, búsqueda fulltext (PostgreSQL `tsvector` o `ILIKE`), filtro por familia | `GET /products?search=...&familyId=...` con respuesta < 300ms |
| X | Módulo `product-families`: CRUD familias jerárquicas (padre/hijo) | Endpoints `/product-families` con árbol |
| J | Búsqueda por código de barras: `GET /products/barcode/:code` | Respuesta inmediata con producto + stock de la tienda |
| J | Importación masiva CSV: `POST /products/import` (parseo + validación + bulk insert) | Endpoint funcional con reporte de errores por fila |
| V | Módulo `audit`: interceptor global que registra cambios en AuditLog | Cada POST/PUT/DELETE crea entrada en audit_logs |
| V | Tests unitarios de auth + products (Vitest) | Cobertura > 80% en módulos auth y products |

#### Dev 2 (Frontend)

| Día | Tarea | Entregable |
|---|---|---|
| L | Pantalla de login (email + password), gestión de tokens (access + refresh) en Zustand + localStorage | Login funcional con redirect |
| L | Configurar Axios/fetch client con interceptor de JWT y refresh automático | API client reutilizable con auth |
| M | Backoffice: página de gestión de catálogo (tabla de productos con filtros, paginación) | Listado de productos con búsqueda y filtro por familia |
| M | Backoffice: modal/formulario de alta/edición de producto | CRUD de producto completo desde backoffice |
| X | Backoffice: gestión de familias (árbol visual, drag and drop o lista anidada) | CRUD de familias con jerarquía |
| X | TPV: componente de búsqueda de producto (campo de texto + resultados en grid/lista) | Búsqueda en vivo con debounce de 200ms |
| J | TPV: navegación por familias (botones con icono/color por familia) | Familias como botones táctiles en la parte superior del TPV |
| J | TPV: integración de escáner de barras (escuchar eventos de teclado del escáner USB) | Escanear barcode añade producto al resultado |
| V | TPV: componente de tarjeta de producto (nombre, precio, stock, imagen) con estados (agotado, bajo stock) | Productos mostrados con información clara |
| V | Tests e2e: flujo login + búsqueda de producto (Playwright) | Test pasa en CI |

#### Criterios de completitud Semana 1

- [ ] Un usuario puede hacer login en TPV y backoffice con roles diferentes
- [ ] Admin puede crear/editar/eliminar productos y familias desde backoffice
- [ ] Dependiente puede buscar productos por nombre, familia y código de barras en el TPV
- [ ] Búsqueda < 300ms con 50+ productos
- [ ] Importación CSV funcional con reporte de errores

---

### Semana 2 — Venta v1 funcional en tienda

**Objetivo:** Un dependiente puede completar una venta completa (buscar, carrito, descuento, cobrar, ticket) y hacer devoluciones.

#### Dev 1 (Backend)

| Día | Tarea | Entregable |
|---|---|---|
| L | Módulo `sales`: crear venta (transacción: insertar sale + lines + decrementar stock atómicamente) | `POST /sales` con transacción ACID |
| L | Generación de nº de ticket secuencial por tienda (formato: `T01-000001`) | Tickets únicos y legibles |
| M | Endpoint de anulación de venta (`POST /sales/:id/void`): restaura stock, requiere rol MANAGER+ | Anulación con auditoría |
| M | Módulo `returns`: crear devolución parcial contra ticket, restaurar stock | `POST /returns` funcional |
| X | Módulo `cash-sessions`: apertura de caja, cierre con cuadre (calcular esperado vs contado) | `POST /cash-sessions/open`, `POST /cash-sessions/:id/close` |
| X | Lógica de descuentos: por línea (%) y por ticket (% o importe fijo), validación de límites por rol | Descuentos aplicados correctamente en el cálculo |
| J | Endpoint historial de ventas por tienda/día con totales: `GET /sales?storeId=...&date=...` | Listado paginado con totales |
| J | Publicar evento en Redis al completar venta (`sale:completed`) para que dashboards lo capten | Pub/sub funcional |
| V | Endpoint generación de ticket (JSON con datos formateados para impresión) | `GET /sales/:id/ticket` devuelve datos del ticket |
| V | Tests: flujo completo de venta + devolución + cierre de caja | Tests de integración pasando |

#### Dev 2 (Frontend)

| Día | Tarea | Entregable |
|---|---|---|
| L | TPV: componente Carrito (lista de líneas, cantidad editable +/-, eliminar línea) | Carrito funcional con estado Zustand |
| L | TPV: cálculo en tiempo real de subtotal, descuentos, total | Totales actualizados al instante |
| M | TPV: modal de descuento (por línea: %, por ticket: % o importe) | Descuentos aplicables desde UI |
| M | TPV: modal de cobro (efectivo: introducir importe, calcular cambio; tarjeta: confirmar) | Flujo de cobro completo |
| X | TPV: pantalla de confirmación post-venta (ticket resumen, botón "Nueva venta") | Ciclo completo: buscar, carrito, cobrar, confirmar |
| X | TPV: flujo de devolución (buscar ticket, seleccionar líneas, motivo, confirmar) | Devolución funcional |
| J | TPV: apertura y cierre de caja (introducir efectivo inicial, al cerrar contar efectivo y ver cuadre) | Flujo de caja funcional |
| J | TPV: optimización touch (botones grandes, scroll fluido, feedback táctil) | UX validada en tablet |
| V | Backoffice: página de ventas del día por tienda (tabla con filtros) | Visibilidad de ventas desde central |
| V | Test e2e: flujo completo venta (login, buscar, carrito, cobrar, ticket) | Test Playwright pasando |

#### Criterios de completitud Semana 2

- [ ] Dependiente completa venta de 3 productos en < 60 segundos
- [ ] Stock se decrementa automáticamente tras cada venta
- [ ] Devolución restaura stock y queda registrada con motivo
- [ ] Cierre de caja muestra cuadre efectivo vs esperado
- [ ] Ticket generado con todos los datos de la venta

---

### Semana 3 — Stock en tiempo real + Traspasos central a tienda

**Objetivo:** Stock visible por tienda y central, alertas de mínimos, flujo completo de traspaso.

#### Dev 1 (Backend)

| Día | Tarea | Entregable |
|---|---|---|
| L | Módulo `stock`: endpoints de consulta (por tienda, global, por producto en todas las tiendas) | `GET /stock?storeId=...`, `GET /stock/global` |
| L | Cache de stock en Redis: escribir stock actual tras cada movimiento, leer de cache en consultas | Consultas de stock < 50ms |
| M | Alertas automáticas: trigger que crea `StockAlert` cuando stock cae por debajo de `minStock` | Alertas generadas automáticamente |
| M | Endpoint de alertas activas: `GET /stock/alerts?storeId=...&resolved=false` ordenadas por urgencia | Panel de alertas funcional |
| X | Módulo `transfers`: crear traspaso (DRAFT), enviar (SENT, decrementar stock origen), recibir (RECEIVED, incrementar stock destino) | Flujo completo de estados con transacciones |
| X | Recepción con discrepancias: registrar cantidades recibidas por línea, calcular diferencia | `POST /transfers/:id/receive` con discrepancias |
| J | Cierre de traspaso: cerrar tras recepción (CLOSED), generar StockMovements de traspaso | Estado final con trazabilidad |
| J | Módulo `stock-movements`: historial por producto + tienda con filtros | `GET /stock/movements?productId=...&storeId=...` |
| V | SSE endpoint compartido para TPV y backoffice: `GET /events` (filtrado por tenant del JWT, tipos: `stock.changed`, `sale.completed`, `alert.created`) | SSE multiplexado funcionando, cliente filtra por tipo |
| V | Ajuste manual de inventario: `POST /stock/adjust` con motivo obligatorio | Ajuste con auditoría |

#### Dev 2 (Frontend)

| Día | Tarea | Entregable |
|---|---|---|
| L | Backoffice: página de stock global (tabla: producto, stock por tienda, stock total, estado alerta) | Vista central de stock |
| L | Backoffice: indicadores visuales de stock (verde/amarillo/rojo segun nivel) | Semáforo de stock intuitivo |
| M | Backoffice: panel de alertas de stock (productos en alerta, ordenados por urgencia, con acciones) | Panel de alertas funcional |
| M | Backoffice: configuración de stock mínimo por producto y tienda | Formulario de mínimos |
| X | Backoffice: crear traspaso (seleccionar tienda destino, añadir productos + cantidades) | Formulario de traspaso |
| X | Backoffice: lista de traspasos con estados y filtros | Tabla de traspasos con badges de estado |
| J | TPV (responsable): pantalla de recepción de traspaso (lista de líneas, input de cantidad recibida, motivo discrepancia) | Flujo de recepción en tienda |
| J | TPV: consulta de stock del producto desde la pantalla de venta (tooltip o modal) | Dependiente ve stock sin salir de la venta |
| J | **TPV: conexión SSE para actualizar stock visible** (carrito + tarjetas de producto) en tiempo real. Health-check cada 10s con bloqueo de cobro si la API no responde > 3s | Stock vivo en TPV. Estado degradado visible si cae la conexión |
| V | Backoffice: historial de movimientos de stock por producto (timeline) | Trazabilidad visual |
| V | Backoffice: conexión SSE para actualizar panel de stock en tiempo real | Stock se actualiza sin refrescar página |

#### Criterios de completitud Semana 3

- [ ] Central ve stock de todas las tiendas en un solo panel
- [ ] Alertas de stock bajo se generan automáticamente y son visibles
- [ ] Traspaso completa flujo: crear (central) -> enviar -> recibir (tienda) -> cerrar
- [ ] Discrepancias en recepción quedan registradas
- [ ] Stock se actualiza en tiempo real en el backoffice

---

### Semana 4 — Compras/proveedor + Reposición sugerida + VeriFactu

**Objetivo:** Central puede generar propuestas de pedido inteligentes, registrar recepciones, y todas las ventas/devoluciones se envían a VeriFactu.

#### Dev 1 (Backend)

| Día | Tarea | Entregable |
|---|---|---|
| L | Módulo `suppliers`: CRUD proveedores | Endpoints `/suppliers` |
| L | Módulo `purchases`: CRUD pedidos a proveedor, estados (DRAFT, CONFIRMED, PARTIALLY_RECEIVED, RECEIVED) | Endpoints `/purchase-orders` |
| M | Algoritmo de propuesta de pedido: por cada producto calcular `cantidad_sugerida = max(0, minStock - stockActual + ventaMediaDiaria * diasCobertura)` | `POST /purchase-orders/suggest` genera propuesta |
| M | Incluir datos de contexto en la propuesta: stock actual, minStock, venta media 30d, rotación, cobertura en días | Propuesta con datos explicables |
| X | Recepción de pedido: parcial o completa, actualizar stock central, crear StockMovements | `POST /purchase-orders/:id/receive` |
| X | Cálculo de KPIs de proveedor: lead time, fill rate | Datos disponibles en respuesta del pedido |
| J | **Módulo `verifactu`**: integración con proveedor certificado homologado. Cola de envío (BullMQ sobre Redis) con reintentos. Encadenamiento de huellas. QR del ticket | Cada venta/devolución genera registro VeriFactu y lo envía a la AEAT vía proveedor |
| J | Endpoint de productos "para pedir" + exportación pedido (CSV/PDF) | Endpoints listos |
| V | Tests de integración: flujo pedido completo + envío VeriFactu (con sandbox) | Tests pasando |
| V | Refactor y documentación con Swagger/OpenAPI | Swagger UI funcional en `/api/docs` |

#### Dev 2 (Frontend)

| Día | Tarea | Entregable |
|---|---|---|
| L | Backoffice: página de proveedores (CRUD) | Gestión de proveedores |
| L | Backoffice: página de pedidos a proveedor (lista con estados, filtros) | Lista de pedidos |
| M | Backoffice: pantalla de "Generar propuesta de pedido" (mostrar sugerencias con contexto, editar cantidades) | Propuesta interactiva |
| M | Backoffice: confirmar pedido y exportar (CSV/PDF) | Flujo de confirmación |
| X | Backoffice: recepción de pedido (interfaz de check de cantidades línea a línea) | Recepción usable |
| X | Backoffice: indicadores de proveedor (lead time, fill rate) | KPIs visibles en detalle de pedido |
| J | TPV: imprimir ticket en impresora térmica ESC/POS (modelo definido en Semana 0). QR VeriFactu visible en ticket | Impresión real probada con hardware del piloto |
| J | TPV: flujo de **devolución sin ticket** (búsqueda producto, motivo obligatorio, autorización MANAGER con PIN) | Devolución sin ticket operativa |
| V | Backoffice: panel de salud VeriFactu (cola de envíos, fallos, reintentos) | Admin ve estado en tiempo real |
| V | Tests e2e: flujo de pedido + flujo venta con impresión + VeriFactu en sandbox | Tests pasando |

#### Criterios de completitud Semana 4

- [ ] Central puede generar propuesta de pedido automática con datos de contexto
- [ ] Propuesta editable y confirmable
- [ ] Recepción de pedido actualiza stock central
- [ ] **VeriFactu operativo en sandbox AEAT** (envío + reintentos + QR + encadenamiento)
- [ ] Impresión de ticket en impresora térmica real funciona
- [ ] Devolución sin ticket operativa con autorización MANAGER
- [ ] API documentada con Swagger

---

### Semana 5 — Dashboards + Permisos + Endurecimiento

**Objetivo:** Dashboards operativos funcionales, permisos endurecidos, sistema preparado para producción.

#### Dev 1 (Backend)

| Día | Tarea | Entregable |
|---|---|---|
| L | Módulo `dashboard`: endpoint ventas por tienda/día con comparativa hoy vs ayer | `GET /dashboard/sales-today` con delta % |
| L | Endpoint ventas por familia/carpeta (periodo seleccionable) | `GET /dashboard/sales-by-family` |
| M | KPIs de rotura de stock: tasa, eventos, duración media, venta perdida estimada | `GET /dashboard/stockout-kpis` |
| M | KPIs de venta: ticket medio, UPT, tasa descuento, tasa devolución | `GET /dashboard/sales-kpis` |
| X | KPIs de margen: margen bruto, % margen, margen real tras descuentos | `GET /dashboard/margin-kpis` |
| X | Ranking de productos: top ventas, top margen, peor rotación | `GET /dashboard/product-rankings` |
| J | Endurecer RBAC: revisar TODOS los endpoints y verificar permisos correctos | Matriz de permisos implementada al 100% |
| J | Rate limiting, helmet, CORS configurado, validación de inputs en todos los endpoints | Seguridad endurecida |
| V | Optimización de queries: añadir índices necesarios, analizar slow queries | Queries de dashboard < 3s |
| V | Script de backup de BD, cron de backups cada 6h | `infra/scripts/backup-db.sh` funcional |

#### Dev 2 (Frontend)

| Día | Tarea | Entregable |
|---|---|---|
| L | Backoffice: dashboard principal (ventas hoy vs ayer por tienda, gráfica de barras) | Dashboard con gráfica Recharts |
| L | Backoffice: widget de facturación acumulada (hoy, semana, mes) con tendencia | KPI cards con sparklines |
| M | Backoffice: gráfica de ventas por familia (pie chart o treemap) | Gráfica interactiva |
| M | Backoffice: panel de KPIs de rotura de stock (cards con indicadores y semáforo) | Panel de roturas visual |
| X | Backoffice: tabla de ranking de productos (tabs: top ventas, top margen, sin rotación) | Rankings interactivos |
| X | Backoffice: selector de periodo (hoy, ayer, semana, mes, custom) para todos los dashboards | Filtro temporal global |
| J | Backoffice: dashboard de tienda individual (para rol MANAGER) | Vista restringida por rol |
| J | Pulir UX completa del TPV: estados de carga, errores, confirmaciones, atajos de teclado | UX pulida |
| V | Preparar checklist de despliegue piloto: manual rápido de usuario, FAQ | Documentos listos |
| V | Test e2e completo: flujo de venta + stock + dashboard | Suite e2e verde |

#### Criterios de completitud Semana 5 — HITO A: V1 VENDIBLE

- [x] Dashboard muestra ventas hoy vs ayer por tienda en tiempo real (#70 API + #71 backoffice)
- [x] KPIs de rotura, ventas, margen calculados y visibles (#70)
- [x] Ventas por familia con gráficas (Recharts PieChart, #71)
- [x] Permisos RBAC verificados en todos los endpoints (matriz documentada en spec #72)
- [x] Backups automatizados (#73: `infra/scripts/backup-db.sh` + cron 6h) + rate limit/helmet/CORS (#72)
- [ ] Documentación de usuario básica lista (manual/checklist — pendiente, Semana 6)

> Implementado el 2026-05-29. Specs en `docs/superpowers/specs/2026-05-29-issue70..73-*.md`.
> Pendiente menor: apertura de la vista MANAGER del dashboard (hoy el backoffice es
> admin-only) y el manual de usuario quedan para la Semana 6.

---

### Semana 6 — Despliegue piloto (1-2 tiendas) + Estabilización

**Objetivo:** Sistema funcionando en producción real con 1-2 tiendas del piloto.

#### Dev 1 (Backend / Infra)

| Día | Tarea | Entregable |
|---|---|---|
| L | Aprovisionar VPS de producción dimensionado para multi-tenant (CPU/RAM holgadas), configurar Docker, Docker Compose, SSL (Let's Encrypt), backups WAL continuos a S3-compatible | Servidor de producción listo, RPO < 5 min real |
| L | Configurar GitHub Actions: CI (lint+test+build) + CD (deploy a VPS via SSH) | Pipeline CI/CD funcional |
| M | Deploy primera versión a producción, smoke tests | Sistema accesible via HTTPS |
| M | Importar catálogo real del piloto (CSV), validar datos, resolver inconsistencias | Catálogo real cargado |
| X | Importar stock inicial (conteo o exportación del sistema actual del piloto) | Stock base cargado |
| X | Crear usuarios reales (admin, responsables, dependientes) con roles y tiendas asignadas | Usuarios listos para usar |
| J | Soporte en tienda durante primer día de uso real, monitorizar errores en Sentry | Primer día de venta real |
| J | Hotfix de bugs críticos detectados en producción | Bugs P0 corregidos |
| V | Revisar logs, tiempos de respuesta, errores, ajustar configuración | Sistema estable |
| V | Reunión de feedback con responsable de tienda y central | Lista de mejoras priorizadas |

#### Dev 2 (Frontend / Soporte)

| Día | Tarea | Entregable |
|---|---|---|
| L | Preparar entorno de formación (datos demo en staging) + verificar router 4G de respaldo instalado en cada tienda piloto | Entorno de práctica + redundancia de conectividad operativa |
| M | Formación a responsable de tienda 1 (60-90 min): venta, devolución, stock, cierre caja | Personal formado |
| M | Formación a dependientes de tienda 1 (30-45 min): solo venta y búsqueda | Personal formado |
| X | Acompañamiento presencial en tienda: observar uso real, tomar notas de fricciones | Diario de fricciones |
| X | Ajustes de catálogo: nombres, iconos de familias, orden | Catálogo optimizado |
| J | Corregir fricciones de UX detectadas en el día anterior | Mejoras desplegadas |
| J | Formación a tienda 2 (si aplica) | Segunda tienda activa |
| V | Corregir segunda ronda de fricciones | UX refinada |
| V | Documentar manual rápido con capturas reales del sistema | Manual v1 entregado |

#### Criterios de completitud Semana 6

- [ ] 1-2 tiendas vendiendo con el nuevo TPV en producción
- [ ] Personal formado y operando autónomamente
- [ ] Bugs P0 de producción corregidos
- [ ] Sentry recogiendo errores, sin errores críticos recurrentes
- [ ] Feedback del piloto documentado y priorizado

---

### Semana 7-8 — Escalado al resto de tiendas + Estabilización + Cierre MVP

**Objetivo:** 6-7 tiendas en producción, KPIs medibles, caso de éxito documentado.

#### Semana 7

| Dev | Tarea | Entregable |
|---|---|---|
| Dev 1 | Escalar a tiendas 3-4: importar stock, crear usuarios, deploy | Tiendas 3-4 activas |
| Dev 1 | Optimizar rendimiento con carga real (7 tiendas concurrentes) | Queries optimizadas, indices ajustados |
| Dev 1 | Implementar mejoras de backend del backlog de feedback del piloto | Mejoras desplegadas |
| Dev 2 | Formación tiendas 3-4 | Personal formado |
| Dev 2 | Implementar mejoras de UX del backlog de feedback | UX mejorada |
| Dev 2 | Afinar dashboards con datos reales (ajustar escalas, agregar filtros pedidos) | Dashboards afinados |

#### Semana 8

| Dev | Tarea | Entregable |
|---|---|---|
| Dev 1 | Escalar a tiendas 5-7 | Todas las tiendas activas |
| Dev 1 | Ajustar alertas de stock y sugerencias de reposición con datos reales | Alertas calibradas |
| Dev 1 | Verificar KPIs con datos reales: calcular baseline para métricas de éxito | KPIs medidos |
| Dev 2 | Formación tiendas 5-7 | Personal formado |
| Dev 2 | Crear caso de éxito: métricas antes/después, capturas, testimonial del piloto | Caso de éxito v1 |
| Dev 2 | Documentación final: manual de usuario, guía de admin, FAQ | Documentación completa |

#### Ambos devs - Cierre

| Tarea | Entregable |
|---|---|
| Reunión de cierre con piloto: revisar KPIs, priorizar roadmap post-MVP | Roadmap post-MVP acordado |
| Retrospectiva técnica: deuda técnica, mejoras arquitectónicas para escalar | Backlog técnico priorizado |
| Preparar demo comercial con datos reales (anonimizados) para futuras ventas | Demo lista para B2B |

#### Criterios de completitud Semana 8 — HITO B: PILOTO ESTABLE

- [ ] 6-7 tiendas operando con el nuevo TPV
- [ ] 0 errores P0 en los últimos 5 días
- [ ] KPIs de éxito medidos y con baseline
- [ ] Dashboard operativo usado diariamente por central
- [ ] Manual de usuario y admin entregados
- [ ] Caso de éxito documentado

---

## 6. API por módulo - Endpoints principales

| Módulo | Método | Endpoint | Roles | Descripción |
|---|---|---|---|---|
| **Auth** | POST | `/auth/login` | Todos | Login con email+password |
| | POST | `/auth/login-pin` | Todos | Login rápido con PIN |
| | POST | `/auth/refresh` | Todos | Renovar access token |
| **Users** | GET | `/users` | ADMIN | Listar usuarios |
| | POST | `/users` | ADMIN | Crear usuario |
| | PUT | `/users/:id` | ADMIN | Editar usuario |
| **Stores** | GET | `/stores` | ADMIN, MANAGER | Listar tiendas |
| | POST | `/stores` | ADMIN | Crear tienda |
| **Products** | GET | `/products` | Todos | Buscar productos (search, familyId, page) |
| | GET | `/products/barcode/:code` | Todos | Buscar por barcode |
| | POST | `/products` | ADMIN | Crear producto |
| | PUT | `/products/:id` | ADMIN | Editar producto |
| | POST | `/products/import` | ADMIN | Importación CSV masiva |
| **Families** | GET | `/product-families` | Todos | Listar familias (arbol) |
| | POST | `/product-families` | ADMIN | Crear familia |
| **Stock** | GET | `/stock` | Todos | Stock por tienda o global |
| | GET | `/stock/alerts` | MANAGER, ADMIN | Alertas activas |
| | POST | `/stock/adjust` | MANAGER, ADMIN | Ajuste manual |
| | GET | `/stock/movements` | MANAGER, ADMIN | Historial de movimientos |
| **Events** | GET | `/events` | Todos (filtrado por tenant) | SSE unificado: `stock.changed`, `sale.completed`, `alert.created`, `transfer.received` |
| **Health** | GET | `/health` | Público | Health-check para detección de degradación en TPV |
| **Modules** | GET | `/modules` | ADMIN | Catálogo de módulos disponibles |
| | GET | `/organization/modules` | ADMIN | Suscripciones activas del tenant |
| | POST | `/organization/modules/:code` | ADMIN | Activar módulo para el tenant |
| **VeriFactu** | POST | `/verifactu/retry/:saleId` | ADMIN | Reenviar manualmente un registro fallido |
| | GET | `/verifactu/queue` | ADMIN | Estado de la cola de envíos |
| **Sales** | POST | `/sales` | Todos | Crear venta |
| | GET | `/sales` | MANAGER, ADMIN | Listar ventas (filtros) |
| | GET | `/sales/:id/ticket` | Todos | Datos de ticket para impresión |
| | POST | `/sales/:id/void` | MANAGER, ADMIN | Anular venta |
| **Returns** | POST | `/returns` | Todos | Crear devolución |
| | GET | `/returns` | MANAGER, ADMIN | Listar devoluciones |
| **Transfers** | POST | `/transfers` | ADMIN | Crear traspaso |
| | PUT | `/transfers/:id/send` | ADMIN | Enviar traspaso |
| | POST | `/transfers/:id/receive` | MANAGER, ADMIN | Recibir traspaso |
| | PUT | `/transfers/:id/close` | ADMIN | Cerrar traspaso |
| **Purchases** | POST | `/purchase-orders/suggest` | ADMIN | Generar propuesta |
| | POST | `/purchase-orders` | ADMIN | Crear pedido |
| | PUT | `/purchase-orders/:id/confirm` | ADMIN | Confirmar pedido |
| | POST | `/purchase-orders/:id/receive` | ADMIN | Recibir pedido |
| **Cash** | POST | `/cash-sessions/open` | MANAGER | Abrir caja |
| | POST | `/cash-sessions/:id/close` | MANAGER | Cerrar caja |
| **Dashboard** | GET | `/dashboard/sales-today` | MANAGER, ADMIN | Ventas hoy vs ayer |
| | GET | `/dashboard/sales-by-family` | ADMIN | Ventas por familia |
| | GET | `/dashboard/sales-kpis` | ADMIN | KPIs de venta |
| | GET | `/dashboard/stockout-kpis` | ADMIN | KPIs de rotura |
| | GET | `/dashboard/margin-kpis` | ADMIN | KPIs de margen |

---

## 7. Entornos

| Entorno | URL | Uso | Datos |
|---|---|---|---|
| **Local (dev)** | `localhost:5173` (tpv), `localhost:5174` (bo) | Desarrollo diario | Datos seed ficticios |
| **Staging** | `staging.tpv.ejemplo.com` | Demos al piloto, formación | Datos reales anonimizados |
| **Producción** | `tpv.ejemplo.com` | Uso real en tiendas | Datos reales |

---

## 8. Resumen visual del timeline

```mermaid
gantt
    title Plan de Desarrollo MVP - 8 Semanas
    dateFormat YYYY-MM-DD
    axisFormat %d/%m

    section Semana 0
    Monorepo + Docker + DB + Seed + Workshop piloto  :s0, 2026-06-02, 3d

    section Semana 1
    Auth + Catalogo CRUD + Busqueda producto TPV      :s1, after s0, 5d

    section Semana 2
    Venta completa + Devoluciones + Cierre caja        :s2, after s1, 5d

    section Semana 3
    Stock tiempo real + Alertas + Traspasos             :s3, after s2, 5d

    section Semana 4
    Compras proveedor + Reposicion sugerida + Offline   :s4, after s3, 5d

    section Semana 5
    Dashboards + KPIs + RBAC + Endurecimiento           :s5, after s4, 5d

    section Semana 6
    Deploy produccion + Piloto 1-2 tiendas              :crit, s6, after s5, 5d

    section Semana 7-8
    Escalado 6-7 tiendas + Estabilizacion + Cierre      :s7, after s6, 10d
```

---

> [!IMPORTANT]
> **Hito A (fin semana 5):** V1 vendible — TPV + stock + traspasos + compras + dashboards. Sistema completo en staging.
>
> **Hito B (fin semana 8):** Piloto estable — 6-7 tiendas en produccion, KPIs medibles, caso de exito documentado.

---

> [!NOTE]
> Este plan asume 2 desarrolladores a tiempo completo. Los tiempos pueden variar segun la complejidad de los datos reales del piloto y el volumen de feedback. Se recomienda una demo semanal con el piloto para ajustar prioridades.
