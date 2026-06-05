import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mockeamos el cliente HTTP real para verificar QUÉ endpoint llama cada lib del
// backoffice en modo real (IT-09), sin backend. isDemo() (api-config) NO se mockea:
// lee VITE_DEMO_MODE, que stubeamos por bloque.
vi.mock('./auth.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));

import * as admin from './admin.js';
import { api } from './auth.js';
import * as families from './families.js';
import * as products from './products.js';

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);
const patch = vi.mocked(api.patch);
const del = vi.mocked(api.del);

describe('cableado API real del backoffice (VITE_DEMO_MODE=false)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DEMO_MODE', 'false');
    vi.clearAllMocks();
    get.mockResolvedValue([] as never);
    post.mockResolvedValue({} as never);
    patch.mockResolvedValue({} as never);
    del.mockResolvedValue(undefined as never);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('families: endpoints /product-families', async () => {
    await families.listFamilies();
    expect(get).toHaveBeenCalledWith('/product-families');
    await families.createFamily({ name: 'Nueva' } as never);
    expect(post).toHaveBeenCalledWith('/product-families', { name: 'Nueva' });
    await families.updateFamily('fam-1', { name: 'X' });
    expect(patch).toHaveBeenCalledWith('/product-families/fam-1', { name: 'X' });
    await families.deleteFamily('fam-1');
    expect(del).toHaveBeenCalledWith('/product-families/fam-1');
  });

  it('products: endpoints /products', async () => {
    await products.listProducts('  cbd ');
    expect(get).toHaveBeenCalledWith('/products', { search: 'cbd' });
    await products.listProducts('');
    expect(get).toHaveBeenLastCalledWith('/products', {});
    await products.createProduct({ name: 'P', salePrice: 10 } as never);
    expect(post).toHaveBeenCalledWith('/products', { name: 'P', salePrice: 10 });
    await products.updateProduct('p-1', { name: 'Q' });
    expect(patch).toHaveBeenCalledWith('/products/p-1', { name: 'Q' });
    await products.deleteProduct('p-1');
    expect(del).toHaveBeenCalledWith('/products/p-1');
  });

  it('admin: usuarios y tiendas', async () => {
    await admin.listUsers();
    expect(get).toHaveBeenCalledWith('/users');
    await admin.createUser({ name: 'Ana', email: 'a@b.test', role: 'MANAGER' } as never);
    expect(post).toHaveBeenCalledWith('/users', {
      name: 'Ana',
      email: 'a@b.test',
      role: 'MANAGER',
    });
    await admin.deleteUser('u-1');
    expect(del).toHaveBeenCalledWith('/users/u-1');

    await admin.listStores();
    expect(get).toHaveBeenCalledWith('/stores');
    await admin.createStore({ name: 'Centro', code: '01' } as never);
    expect(post).toHaveBeenCalledWith('/stores', { name: 'Centro', code: '01' });
    await admin.deleteStore('s-1');
    expect(del).toHaveBeenCalledWith('/stores/s-1');
  });
});

describe('modo demo (opt-in, VITE_DEMO_MODE=true): no llama a la API', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
    vi.clearAllMocks();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('families/products devuelven demo sin tocar la api', async () => {
    const fams = await families.listFamilies();
    expect(Array.isArray(fams)).toBe(true);
    await products.listProducts('cbd');
    expect(get).not.toHaveBeenCalled();
  });
});
