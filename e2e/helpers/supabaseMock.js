export const MOCK_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'tester@stockflow.local',
  email_confirmed_at: '2026-01-01T00:00:00.000Z',
  user_metadata: { full_name: 'E2E Tester' },
  app_metadata: { provider: 'email', providers: ['email'] },
  created_at: '2026-01-01T00:00:00.000Z',
};

export const MOCK_SESSION = {
  access_token: 'mock-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'mock-refresh-token',
  user: MOCK_USER,
};

export const DEFAULT_PERMISSIONS = [
  'dashboard.view',
  'projects.view',
  'items.view',
  'withdrawals.view',
  'withdrawals.create',
  'checkouts.view',
  'checkouts.create',
];

export const MOCK_PROFILE = {
  id: MOCK_USER.id,
  full_name: 'E2E Tester',
  role: 'staff',
  role_id: 'role-staff-1',
  status: 'active',
  all_projects: true,
  must_change_password: false,
  roles: {
    id: 'role-staff-1',
    code: 'STAFF',
    name: 'Staff',
  },
};

export const MOCK_PROJECTS = [
  {
    id: 'proj-1',
    name: 'Main Warehouse',
    project_code: 'WH-01',
    location: 'Building A',
    description: 'Central warehouse',
    status: 'active',
  },
];

export const MOCK_CATEGORIES = [
  { id: 'cat-1', name: 'Networking', description: 'Network hardware' },
];

export const MOCK_ITEMS = [
  {
    id: 'item-1',
    name: 'Fiber Patch Cord LC-LC',
    unit: 'pcs',
    sku: 'FPC-001',
    image_url: null,
    category_id: 'cat-1',
    model: 'LC-DX-3M',
    item_type: 'consumable',
    parent_sku: null,
    description: '3m fiber patch cord',
    notes: null,
  },
  {
    id: 'item-2',
    name: 'Gigabit SFP Module',
    unit: 'pcs',
    sku: 'SFP-1G',
    image_url: null,
    category_id: 'cat-1',
    model: 'SFP-SX',
    item_type: 'consumable',
    parent_sku: null,
    description: '1G SFP transceiver',
    notes: null,
  },
];

export const MOCK_STOCK_BALANCES = [
  {
    project_id: 'proj-1',
    item_id: 'item-1',
    item_name: 'Fiber Patch Cord LC-LC',
    unit: 'pcs',
    project_name: 'Main Warehouse',
    balance: 25,
  },
  {
    project_id: 'proj-1',
    item_id: 'item-2',
    item_name: 'Gigabit SFP Module',
    unit: 'pcs',
    project_name: 'Main Warehouse',
    balance: 10,
  },
];

export const MOCK_CHECKOUT_ORDERS = [
  {
    id: 'chk-order-1',
    order_number: 'CHK-2026-0001',
    status: 'pending',
    project_id: 'proj-1',
    created_by: MOCK_USER.id,
    borrower_name: 'Somchai Tester',
    borrower_department: 'Network Ops',
    purpose: 'Site survey',
    expected_return_date: '2026-12-01',
    created_at: '2026-11-15T08:00:00.000Z',
    projects: MOCK_PROJECTS[0],
    profiles: { id: MOCK_USER.id, full_name: 'E2E Tester', role: 'staff' },
    checkout_items: [
      {
        id: 'chk-item-1',
        order_id: 'chk-order-1',
        item_id: 'item-2',
        quantity: 2,
        serial_number: 'SN-1001',
        items: MOCK_ITEMS[1],
      },
    ],
    checkout_return_logs: [],
  },
];

export async function setTestLanguage(page, lang = 'en') {
  await page.addInitScript((selectedLang) => {
    window.localStorage.setItem('stockflow.app.lang', selectedLang);
  }, lang);
}

/**
 * Intercepts all Supabase Auth/REST/RPC/Realtime and /api/* network calls
 * so E2E tests never touch real Supabase or Cloudflare R2.
 */
export async function setupApiMocks(page, overrides = {}) {
  const {
    permissions = DEFAULT_PERMISSIONS,
    profile = MOCK_PROFILE,
    projects = MOCK_PROJECTS,
    categories = MOCK_CATEGORIES,
    items = MOCK_ITEMS,
    stockBalances = MOCK_STOCK_BALANCES,
    withdrawalOrders = [],
    checkoutOrders = MOCK_CHECKOUT_ORDERS,
    loginError = null,
  } = overrides;

  await page.routeWebSocket('**/realtime/v1/**', (ws) => {
    ws.onMessage(() => {});
  });

  await page.route('**/api/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.route('**/auth/v1/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    if (url.includes('/token') && method === 'POST') {
      if (loginError) {
        await route.fulfill({
          status: loginError.status || 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'invalid_grant',
            error_description: loginError.message || 'Invalid login credentials',
            message: loginError.message || 'Invalid login credentials',
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SESSION),
      });
      return;
    }

    if (url.includes('/user') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_USER),
      });
      return;
    }

    if (url.includes('/logout')) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const pathname = url.pathname;
    const accept = req.headers()['accept'] || '';
    const wantsSingleObject = accept.includes('application/vnd.pgrst.object+json');

    const fulfillJson = (data) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(data),
      });

    if (pathname.endsWith('/rpc/get_my_permissions') || pathname.endsWith('/rpc/get_user_permissions')) {
      return fulfillJson(permissions);
    }

    if (pathname.endsWith('/profiles')) {
      return fulfillJson(wantsSingleObject ? profile : [profile]);
    }

    if (pathname.endsWith('/user_project_assignments')) {
      return fulfillJson([]);
    }

    if (pathname.endsWith('/projects')) {
      return fulfillJson(wantsSingleObject ? (projects[0] || null) : projects);
    }

    if (pathname.endsWith('/categories')) {
      return fulfillJson(wantsSingleObject ? (categories[0] || null) : categories);
    }

    if (pathname.endsWith('/items')) {
      return fulfillJson(wantsSingleObject ? (items[0] || null) : items);
    }

    if (pathname.endsWith('/stock_balance')) {
      return fulfillJson(stockBalances);
    }

    if (pathname.endsWith('/withdrawal_orders')) {
      return fulfillJson(withdrawalOrders);
    }

    if (pathname.endsWith('/withdrawal_items')) {
      return fulfillJson([]);
    }

    if (pathname.endsWith('/checkout_orders')) {
      return fulfillJson(checkoutOrders);
    }

    if (pathname.endsWith('/checkout_items') || pathname.endsWith('/checkout_return_logs')) {
      return fulfillJson([]);
    }

    return fulfillJson(wantsSingleObject ? null : []);
  });
}

/**
 * Signs in through the mocked login form so supabase-js persists
 * the fake auth session in localStorage under its exact project storage key.
 */
export async function loginWithMockedSession(page) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(MOCK_USER.email);
  await page.getByRole('textbox', { name: 'Password' }).fill('mock-password-123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('**/dashboard');
}
