// State and helpers
const DEV = new URLSearchParams(location.search).get('dev') === '1';

const state = {
  user: null,
  companies: [],
  currentCompanyId: null,
  theme: localStorage.getItem('theme') || 'light',
  route: 'dashboard',
  catalogs: null,
  transactions: [],
  // Paginação de Transações
  txPage: 1,
  txPageSize: 10,
  // Paginação de Contas
  accPage: 1,
  accPageSize: 10,
  accItems: [],
  accOpening: 0,
  // Guards to avoid duplicate event bindings on Catalogs screen
  catalogFormsBound: false,
  catalogDefaultBound: false,
};

const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));

function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function parseBRLToFloat(str) {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  // Remove todos os caracteres exceto números, vírgula e ponto
  const cleaned = String(str).replace(/[^0-9,.-]/g, '');
  // Se tiver vírgula, remove todos os pontos (são separadores de milhar) e substitui a vírgula por ponto
  if (cleaned.includes(',')) {
    const normalized = cleaned.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(normalized);
    return isNaN(num) ? 0 : num;
  }
  // Se não tiver vírgula, remove todos os pontos (são separadores de milhar)
  const normalized = cleaned.replace(/\./g, '');
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
}

// Currency input mask: formats as BRL while typing (e.g., R$ 1.234,56)
function attachCurrencyMask(input) {
  if (!input) return;
  const format = () => {
    const digits = String(input.value || '').replace(/\D/g, '');
    const num = parseInt(digits || '0', 10);
    const value = (num / 100);
    input.value = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };
  input.addEventListener('input', format);
  input.addEventListener('blur', () => { if (!input.value) input.value = 'R$\u00A00,00'; });
}

// Date helpers for dd/mm/yyyy UI and ISO storage
function formatISOToBR(iso) {
  if (!iso) return '';
  const [y,m,d] = String(iso).split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}
function parseBRToISO(br) {
  if (!br) return '';
  const m = String(br).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return br; // if already ISO or invalid, pass through
  return `${m[3]}-${m[2]}-${m[1]}`;
}
function attachDateMask(input) {
  if (!input) return;
  input.addEventListener('input', () => {
    let v = String(input.value || '').replace(/\D/g, '').slice(0, 8);
    if (v.length >= 5) input.value = `${v.slice(0,2)}/${v.slice(2,4)}/${v.slice(4)}`;
    else if (v.length >= 3) input.value = `${v.slice(0,2)}/${v.slice(2)}`;
    else input.value = v;
  });
}

function setTheme(theme) {
  state.theme = theme;
  localStorage.setItem('theme', theme);
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

function initTheme() {
  setTheme(state.theme);
  qs('#theme-toggle').textContent = state.theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  const next = state.theme === 'dark' ? 'light' : 'dark';
  setTheme(next);
  qs('#theme-toggle').textContent = next === 'dark' ? '☀️' : '🌙';
  if (state.route === 'dashboard') {
    // Re-render charts to apply dark grid/tick colors
    refreshDashboard();
  }
}

function show(viewId) {
  ['#loading-view', '#auth-view', '#onboarding-view', '#app-view'].forEach((id) => {
    const el = qs(id);
    if (el) el.classList.add('hidden');
  });
  const target = qs(viewId);
  if (target) target.classList.remove('hidden');
}

function setRoute(route) {
  state.route = route;
  try { localStorage.setItem('route', route); } catch (e) {}
  if ((location.hash || '') !== ('#' + route)) { location.hash = '#' + route; }
  qsa('.nav-link').forEach((a) => a.classList.remove('active'));
  const link = document.querySelector(`a[href="#${route}"]`);
  if (link) link.classList.add('active');
  qs('#page-title').textContent = route.charAt(0).toUpperCase() + route.slice(1);
  ['dashboard','transactions','reports','accounts','catalogs','companies','profile'].forEach((r) => {
    qs(`#view-${r}`).classList.toggle('hidden', r !== route);
  });
  if (route === 'dashboard') {
    refreshDashboard();
  }
  if (route === 'transactions') {
    initTransactions();
  }
  if (route === 'reports') {
    initReports();
  }
  if (route === 'accounts') {
    initAccounts();
  }
  if (route === 'catalogs') {
    initCatalogs();
  }
  if (route === 'companies') {
    initCompanies();
  }
  if (route === 'profile') {
    initProfile();
  }
}

// Auth handlers
async function apiAuth(action, payload) {
  if (DEV) {
    if (action === 'login' || action === 'register') {
      return { success: true, user: { id: 'devuser', name: payload?.name || 'Usuário Dev', email: payload?.email || 'dev@example.com' } };
    }
    if (action === 'logout') return { success: true };
    return { success: false };
  }
  const res = await fetch('/api/auth.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('Auth API resposta não-JSON:', text);
    return { success: false, message: 'Resposta inválida da API de autenticação.' };
  }
}

async function apiCompanies(action, payload) {
  if (DEV) {
    if (action === 'list') {
      return { success: true, items: state.companies };
    }
    if (action === 'create') {
      const id = 'cmp_dev';
      state.companies = [{ id, name: payload?.name || 'Empresa Dev' }];
      return { success: true, items: state.companies };
    }
    return { success: false };
  }
  const method = action === 'list' ? 'GET' : 'POST';
  const res = await fetch(`/api/companies.php`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: action === 'list' ? null : JSON.stringify(payload || {}),
  });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch(e) { console.error('Companies API resposta não-JSON:', text); return { success: false, message: 'Resposta inválida da API de empresas.' }; }
}

// Profile API
async function apiProfile(action, payload, options) {
  if (DEV) {
    if (action === 'get') {
      return { success: true, user: { id: state.user?.id || 'devuser', name: state.user?.name || 'Usuário Dev', email: state.user?.email || 'dev@example.com', avatar_url: '' } };
    }
    if (action === 'update-basic') { return { success: true }; }
    if (action === 'change-password') { return { success: true }; }
    if (action === 'upload-avatar') { return { success: true, avatar_url: '' }; }
    if (action === 'delete-account') { return { success: true }; }
    return { success: false };
  }
  const methodMap = {
    'get': 'GET',
    'update-basic': 'PUT',
    'change-password': 'PUT',
    'upload-avatar': 'POST',
    'delete-account': 'DELETE',
  };
  const method = methodMap[action] || 'POST';
  const url = new URL('/api/profile.php', window.location.origin);
  url.searchParams.set('action', action);
  const opts = options || {};
  let body = null; let headers = {};
  if (action === 'upload-avatar' && payload instanceof FormData) {
    body = payload; // deixar o browser definir o Content-Type
  } else if (method === 'GET') {
    body = null;
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(payload || {});
  }
  const res = await fetch(url.toString(), { method, headers, body, ...opts });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch(e) { console.error('Profile API resposta não-JSON:', text); return { success: false, message: 'Resposta inválida da API de perfil.' }; }
}

async function apiDashboard(params) {
  if (DEV) {
    return computeClientDashboard(params);
  }
  const url = new URL('/api/transactions.php', window.location.origin);
  Object.entries(params || {}).forEach(([k,v])=> url.searchParams.set(k,v));
  const res = await fetch(url.toString());
  const text = await res.text();
  try { return JSON.parse(text); }
  catch(e) { console.error('Dashboard API resposta não-JSON:', text); return { success: false, message: 'Resposta inválida da API do dashboard.' }; }
}

async function apiCatalogs() {
  if (DEV) {
    const catalogs = {
      categories: [
        { id: 'cat_inc_vendas', name: 'Vendas', type: 'income', subcategories: [] },
        { id: 'cat_inc_servicos', name: 'Serviços', type: 'income', subcategories: [] },
        { id: 'cat_exp_insumos', name: 'Insumos', type: 'expense', subcategories: [ {id:'sub_exp_insumos_mat',name:'Matéria-Prima'} ] },
        { id: 'cat_exp_marketing', name: 'Marketing', type: 'expense', subcategories: [ {id:'sub_exp_mark_ads',name:'Anúncios'} ] },
        { id: 'cat_exp_operacional', name: 'Operacional', type: 'expense', subcategories: [] },
        { id: 'cat_exp_impostos', name: 'Impostos', type: 'expense', subcategories: [] },
      ],
      accounts: [ { id: 'acc_main', name: 'Conta Principal' } ],
      cost_centers: [ { id: 'cc_geral', name: 'Geral' }, { id: 'cc_loja', name: 'Loja' } ],
      payment_methods: [
        { id: 'pm_pix', name: 'PIX', fees: [] },
        { id: 'pm_cash', name: 'Dinheiro', fees: [] },
        { id: 'pm_card', name: 'Cartão (Maquininha)', fees: [
          { id: 'fee_debito', name: 'Débito — 2%', percent: 0.02 },
          { id: 'fee_credito', name: 'Crédito — 3.5%', percent: 0.035 },
          { id: 'fee_parcelado', name: 'Parcelado — 5%', percent: 0.05 },
        ]},
      ],
    };
    return { success: true, catalogs };
  }
  const url = new URL('/api/catalogs.php', window.location.origin);
  if (state.currentCompanyId) {
    url.searchParams.set('company_id', state.currentCompanyId);
  }
  const res = await fetch(url.toString());
  const text = await res.text();
  try { return JSON.parse(text); }
  catch(e) { console.error('Catalogs API resposta não-JSON:', text); return { success: false, message: 'Resposta inválida da API de catálogos.' }; }
}

// Catalogs CRUD (DEV simulado, produção via API)
async function apiCatalogsCRUD(entity, action, payload) {
  if (DEV) {
    const c = state.catalogs || (await apiCatalogs()).catalogs;
    const genId = (p) => `${p}_${Math.random().toString(36).slice(2,8)}`;
    if (action === 'list') {
      if (entity === 'fees') return { success: true, items: (c.payment_methods||[]).flatMap(pm=> (pm.fees||[]).map(f=> ({...f, payment_method_id: pm.id, payment_method_name: pm.name}))) };
      if (entity === 'subcategories') return { success: true, items: (c.categories||[]).flatMap(cat=> (cat.subcategories||[]).map(sub=> ({...sub, category_id: cat.id, category_name: cat.name}))) };
      return { success: true, items: c[entity] || [] };
    }
    if (action === 'update') {
      if (entity === 'categories') { const it = (c.categories||[]).find(x=> x.id === payload.id); if (it && payload.name!=null) it.name = payload.name; return { success: true }; }
      if (entity === 'subcategories') {
        for (const cat of c.categories||[]) { const sub = (cat.subcategories||[]).find(s=> s.id === payload.id); if (sub && payload.name!=null) { sub.name = payload.name; return { success: true }; } }
        return { success: true };
      }
      if (entity === 'cost_centers') { const it = (c.cost_centers||[]).find(x=> x.id === payload.id); if (it && payload.name!=null) it.name = payload.name; return { success: true }; }
      if (entity === 'accounts') { const it = (c.accounts||[]).find(x=> x.id === payload.id); if (it) { if (payload.name!=null) it.name = payload.name; if (payload.initial_balance!=null) it.initial_balance = payload.initial_balance; } return { success: true }; }
      if (entity === 'payment_methods') { const it = (c.payment_methods||[]).find(x=> x.id === payload.id); if (it && payload.name!=null) it.name = payload.name; return { success: true }; }
    }
    if (action === 'create') {
      if (entity === 'categories') { const item = { id: genId('cat'), name: payload.name, type: payload.type, subcategories: [] }; c.categories.push(item); return { success: true, item }; }
      if (entity === 'subcategories') { const parent = c.categories.find(x=> x.id === payload.category_id); const sub = { id: genId('sub'), name: payload.name }; if (parent) parent.subcategories.push(sub); return { success: true, item: sub }; }
      if (entity === 'cost_centers') { const item = { id: genId('cc'), name: payload.name }; c.cost_centers.push(item); return { success: true, item }; }
      if (entity === 'accounts') { const item = { id: genId('acc'), name: payload.name }; c.accounts.push(item); return { success: true, item }; }
      if (entity === 'payment_methods') { const item = { id: genId('pm'), name: payload.name, fees: [] }; c.payment_methods.push(item); return { success: true, item }; }
      if (entity === 'fees') { const pm = c.payment_methods.find(x=> x.id === payload.payment_method_id); const fee = { id: genId('fee'), name: payload.name, percent: parseFloat(payload.percent) }; if (pm) pm.fees.push(fee); return { success: true, item: fee }; }
    }
    if (action === 'delete') {
      if (entity === 'categories') c.categories = c.categories.filter(x=> x.id !== payload.id);
      if (entity === 'subcategories') { const parent = c.categories.find(x=> x.id === payload.category_id); if (parent) parent.subcategories = parent.subcategories.filter(s=> s.id !== payload.id); }
      if (entity === 'cost_centers') c.cost_centers = c.cost_centers.filter(x=> x.id !== payload.id);
      if (entity === 'accounts') c.accounts = c.accounts.filter(x=> x.id !== payload.id);
      if (entity === 'payment_methods') c.payment_methods = c.payment_methods.filter(x=> x.id !== payload.id);
      if (entity === 'fees') { const pm = c.payment_methods.find(x=> x.id === payload.payment_method_id); if (pm) pm.fees = pm.fees.filter(f=> f.id !== payload.id); }
      return { success: true };
    }
    state.catalogs = c;
    return { success: false };
  }
  const method = action === 'list' ? 'GET' : (action === 'create' ? 'POST' : (action === 'update' ? 'PUT' : 'DELETE'));
  const companyId = state.currentCompanyId;
  let url = new URL('/api/catalogs.php', window.location.origin);
  url.searchParams.set('entity', entity);
  if (method === 'GET' && companyId) {
    url.searchParams.set('company_id', companyId);
  }
  const body = method==='GET' ? null : JSON.stringify({ ...(payload || {}), company_id: companyId });
  const res = await fetch(url.toString(), { method, headers: { 'Content-Type': 'application/json' }, body });
  return res.json();
}

async function apiTransactions(action, payloadOrParams) {
  if (DEV) {
    if (action === 'list') {
      const { company_id, status, type, year, month, cost_center, category_id } = payloadOrParams || {};
      const items = state.transactions.filter(t => {
        // Empresa
        const okCompany = (!company_id || t.company_id === company_id);
        // Status: realizado -> true, projetado -> false, todas -> sem filtro
        const okStatus = (!status || status === 'todas')
          ? true
          : (status === 'realizado' ? t.status === true : (status === 'projetado' ? t.status === false : true));
        // Tipo: income|expense quando informado
        const okType = (!type || t.type === type);
        // Centro de custo
        const okCC = (!cost_center || cost_center === 'todos' || t.cost_center_id === cost_center);
        // Categoria
        const okCat = (!category_id || category_id === 'todos' || t.category_id === category_id);
        // Ano/Mês
        let okDate = true;
        const mm = String(month || '').padStart(2,'0');
        if (year) {
          okDate = (month === 'todos')
            ? (t.date || '').startsWith(String(year))
            : (t.date || '').startsWith(`${year}-${mm}`);
        } else if (month && month !== 'todos') {
          okDate = (t.date || '').slice(5,7) === mm;
        }
        return okCompany && okStatus && okType && okCC && okCat && okDate;
      });
      return { success: true, items };
    }
    if (action === 'create') {
      const tx = { id: `tx_${Date.now()}`, user_id: 'devuser', ...payloadOrParams };
      state.transactions.push(tx);
      return { success: true, item: tx };
    }
    if (action === 'update') {
      const upd = payloadOrParams || {};
      const idx = state.transactions.findIndex(t => t.id === upd.id);
      if (idx >= 0) {
        state.transactions[idx] = { ...state.transactions[idx], ...upd };
        return { success: true };
      }
      return { success: false, message: 'Transação não encontrada' };
    }
    if (action === 'delete') {
      const id = payloadOrParams?.id;
      const before = state.transactions.length;
      state.transactions = state.transactions.filter(t => t.id !== id);
      return { success: before !== state.transactions.length };
    }
    return { success: false };
  }
  if (action === 'list') {
    const url = new URL('/api/transactions.php', window.location.origin);
    Object.entries(payloadOrParams || {}).forEach(([k,v])=> { if (v !== null && v !== undefined) url.searchParams.set(k,v); });
    const res = await fetch(url.toString());
    const text = await res.text();
    try { return JSON.parse(text); }
    catch(e) { console.error('Transactions list resposta não-JSON:', text); return { success: false, message: 'Resposta inválida da API de transações (list).' }; }
  }
  if (action === 'create') {
  const res = await fetch('/api/transactions.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadOrParams)
    });
    const text = await res.text();
    try { return JSON.parse(text); }
    catch(e) { console.error('Transactions create resposta não-JSON:', text); return { success: false, message: 'Resposta inválida da API de transações (create).' }; }
  }
  if (action === 'update') {
  const res = await fetch('/api/transactions.php', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadOrParams)
    });
    const text = await res.text();
    try { return JSON.parse(text); }
    catch(e) { console.error('Transactions update resposta não-JSON:', text); return { success: false, message: 'Resposta inválida da API de transações (update).' }; }
  }
  if (action === 'delete') {
    const id = payloadOrParams?.id;
    const res = await fetch(`/api/transactions.php?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const text = await res.text();
    try { return JSON.parse(text); }
    catch(e) { console.error('Transactions delete resposta não-JSON:', text); return { success: false, message: 'Resposta inválida da API de transações (delete).' }; }
  }
}

function computeClientDashboard(params) {
  const { year, month, cost_center, status } = params;
  const items = state.transactions.filter(t => (
    (!cost_center || cost_center==='todos' || t.cost_center_id===cost_center) &&
    (status!=='realizado' || t.status===true)
  ));
  // Trend
  let labels = [], incomeSeries = [], expenseSeries = [];
  if (month === 'todos') {
    labels = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    for (let m=1;m<=12;m++) {
      const mStr = String(m).padStart(2,'0');
      const inc = items.filter(t=> t.type==='income' && t.date.startsWith(`${year}-${mStr}`)).reduce((a,b)=>a+b.amount,0);
      const exp = items.filter(t=> t.type==='expense' && t.date.startsWith(`${year}-${mStr}`)).reduce((a,b)=>a+b.amount,0);
      incomeSeries.push(inc); expenseSeries.push(exp);
    }
  } else {
    const days = new Date(year, parseInt(month), 0).getDate();
    labels = Array.from({length:days}, (_,i)=> i+1);
    for (let d=1; d<=days; d++) {
      const dStr = String(d).padStart(2,'0');
      const inc = items.filter(t=> t.type==='income' && t.date === `${year}-${month}-${dStr}`).reduce((a,b)=>a+b.amount,0);
      const exp = items.filter(t=> t.type==='expense' && t.date === `${year}-${month}-${dStr}`).reduce((a,b)=>a+b.amount,0);
      incomeSeries.push(inc); expenseSeries.push(exp);
    }
  }
  const sumI = items.filter(t=> t.type==='income').reduce((a,b)=>a+b.amount,0);
  const sumE = items.filter(t=> t.type==='expense').reduce((a,b)=>a+b.amount,0);
  const fees = items.filter(t=> t.type==='income').reduce((a,b)=> a + ((b.fee_percent||0)*b.amount), 0);
  const profit = sumI - (sumE + fees);
  const expCatsMap = {}; const incCatsMap = {};
  for (const t of items) {
    const map = t.type==='expense' ? expCatsMap : incCatsMap;
    map[t.category_id] = (map[t.category_id]||0) + t.amount;
  }
  // labels em DEV devem ser os NOMES das categorias para compatibilidade visual
  const catMap = Object.fromEntries((state.catalogs?.categories||[]).map(c=> [c.id, c.name]));
  const toArr = (m) => ({ labels: Object.keys(m).map(id=> id==='—' ? 'Sem Categoria' : (catMap[id]||id)), values: Object.values(m) });
  return {
    success: true,
    items,
    summary: { income: sumI, expense: sumE + fees, profit, margin: sumI ? profit/sumI : 0 },
    trend: { labels, income: incomeSeries, expense: expenseSeries },
    categories: { expense: toArr(expCatsMap), income: toArr(incCatsMap) },
    last_transactions: items.slice().sort((a,b)=> b.date.localeCompare(a.date)).slice(0,5).map(t=>({ description: t.description, type: t.type, amount: t.amount })),
  };
}

function bindAuthUI() {
  const loginBtn = qs('#btn-login');
  const registerBtn = qs('#btn-register');
  const loginForm = qs('#form-login');
  const registerForm = qs('#form-register');
  const googleBtn = qs('#btn-google');

  loginBtn.addEventListener('click', () => {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    loginBtn.classList.add('bg-accent','text-white');
    registerBtn.classList.remove('bg-accent','text-white');
  });
  registerBtn.addEventListener('click', () => {
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    registerBtn.classList.add('bg-accent','text-white');
    loginBtn.classList.remove('bg-accent','text-white');
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(loginForm);
    const res = await apiAuth('login', { email: form.get('email'), password: form.get('password') });
    if (res.success) {
      state.user = res.user;
      await postLogin();
    } else {
      alert(res.message || 'Falha no login');
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(registerForm);
    const res = await apiAuth('register', { name: form.get('name'), email: form.get('email'), password: form.get('password') });
    if (res.success) {
      state.user = res.user;
      await postLogin();
    } else {
      alert(res.message || 'Falha no cadastro');
    }
  });

  googleBtn.addEventListener('click', () => {
    alert('OAuth Google não configurado nesta versão.');
  });
}

async function postLogin() {
  const companies = await apiCompanies('list');
  state.companies = companies.items || [];
  if (!state.companies.length) {
    qs('#onboarding-name').textContent = state.user.name || state.user.email;
    show('#onboarding-view');
  } else {
    const persistedCompanyId = localStorage.getItem('currentCompanyId');
    const exists = persistedCompanyId && state.companies.some(c => String(c.id) === String(persistedCompanyId));
    state.currentCompanyId = exists ? persistedCompanyId : state.companies[0].id;
    try { localStorage.setItem('currentCompanyId', String(state.currentCompanyId)); } catch(e) {}
    await enterApp();
  }
}

function bindOnboardingUI() {
  const form = qs('#form-company');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const res = await apiCompanies('create', { name: fd.get('name') });
    if (res.success) {
      state.companies = res.items;
      state.currentCompanyId = state.companies[0].id;
      await enterApp();
    } else {
      alert(res.message || 'Erro ao criar empresa');
    }
  });
}

async function enterApp() {
  show('#app-view');
  populateCompanySelect();
  initHeader();
  await loadCatalogs();
  initDashboard();
  const allowedRoutes = ['dashboard','transactions','reports','accounts','catalogs','companies','profile'];
  const storedRoute = (localStorage.getItem('route') || '').trim();
  const hashRoute = (location.hash || '').replace('#','').trim();
  let initialRoute = hashRoute || storedRoute || state.route;
  if (!allowedRoutes.includes(initialRoute)) initialRoute = 'dashboard';
  setRoute(initialRoute);
}

function populateCompanySelect() {
  const sel = qs('#company-select');
  sel.innerHTML = state.companies.map(c => `<option value="${c.id}" ${c.id===state.currentCompanyId?'selected':''}>${c.name}</option>`).join('');
  sel.addEventListener('change', async () => {
    state.currentCompanyId = sel.value;
    try { localStorage.setItem('currentCompanyId', String(state.currentCompanyId)); } catch(e) {}
    await loadCatalogs();
    // Atualiza a view atual conforme a rota ativa
    if (state.route === 'dashboard') {
      await refreshDashboard();
    } else if (state.route === 'transactions') {
      await refreshTransactions();
    } else if (state.route === 'accounts') {
      await refreshAccounts();
    } else if (state.route === 'catalogs') {
      await refreshCatalogLists();
    }
  });
}

// =====================
// Companies screen
// =====================
function initCompanies() {
  // Lista inicial
  refreshCompanies();
  // Bind do formulário de criação
  const form = qs('#form-company-manage');
  if (form && !form._bound) {
    form._bound = true;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = (form.querySelector('[name="name"]').value || '').trim();
      if (!name) { alert('Informe o nome da empresa'); return; }
      const res = await apiCompanies('create', { name });
      if (!res.success) { alert(res.message || 'Falha ao criar empresa'); return; }
      await refreshCompanies();
      form.reset();
    });
  }
}

async function refreshCompanies() {
  const res = await apiCompanies('list');
  if (res?.items) {
    state.companies = res.items;
    if (!state.currentCompanyId && state.companies.length) {
      state.currentCompanyId = state.companies[0].id;
    }
  }
  renderCompaniesList(state.companies);
  populateCompanySelect();
}

function renderCompaniesList(items) {
  const list = qs('#companies-list');
  if (!list) return;
  if (!items || !items.length) {
    list.innerHTML = '<li class="text-sm text-slate-600 dark:text-slate-300">Nenhuma empresa cadastrada ainda.</li>';
    return;
  }
  list.innerHTML = items.map((c) => {
    const active = c.id === state.currentCompanyId;
    return `<li class="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
      <div class="flex items-center gap-2">
        <span class="font-medium">${c.name}</span>
        ${active ? '<span class="pill pill-green">Ativa</span>' : ''}
      </div>
      <div>
        ${active ? '<button class="btn-secondary" disabled>Selecionada</button>' : `<button class="btn-primary" data-act-select="${c.id}">Selecionar</button>`}
      </div>
    </li>`;
  }).join('');
  // Bind nos botões de seleção
  qsa('[data-act-select]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-act-select');
      await selectCompany(id);
    });
  });
}

async function selectCompany(id) {
  state.currentCompanyId = id;
  try { localStorage.setItem('currentCompanyId', String(state.currentCompanyId)); } catch(e) {}
  // Atualiza select do header
  const sel = qs('#company-select');
  if (sel) sel.value = id;
  await loadCatalogs();
  // Atualiza telas conforme rota
  if (state.route === 'dashboard') {
    await refreshDashboard();
  } else if (state.route === 'transactions') {
    await refreshTransactions();
  } else if (state.route === 'accounts') {
    await refreshAccounts();
  } else if (state.route === 'catalogs') {
    await refreshCatalogLists();
  }
  // Re-render da lista
  renderCompaniesList(state.companies);
}

async function loadCatalogs() {
  const res = await apiCatalogs();
  if (res.success) {
    state.catalogs = res.catalogs;
    populateFiltersFromCatalogs();
    populateModalFromCatalogs();
  }
}

function populateFiltersFromCatalogs() {
  const ccSel = qs('#filter-cc');
  const opts = ['<option value="todos">Centro de Custo: Todos</option>']
    .concat((state.catalogs?.cost_centers||[]).map(cc=> `<option value="${cc.id}">${cc.name}</option>`));
  ccSel.innerHTML = opts.join('');
  const txCcSel = qs('#tx-filter-cc');
  if (txCcSel) txCcSel.innerHTML = opts.join('');
  const txCatSel = qs('#tx-filter-category');
  if (txCatSel) {
    const catOpts = ['<option value="todos">Categoria: Todas</option>']
      .concat((state.catalogs?.categories||[]).map(c=> `<option value="${c.id}">${c.name}</option>`));
    txCatSel.innerHTML = catOpts.join('');
  }
  const accSel = qs('#acc-select');
  if (accSel) {
    const accounts = state.catalogs?.accounts || [];
    accSel.innerHTML = accounts.map(a=> `<option value="${a.id}">${a.name}</option>`).join('');
    const defAcc = accounts.find(a => a.is_default) || accounts[0];
    if (defAcc) accSel.value = defAcc.id;
  }
}

function populateModalFromCatalogs() {
  const accSel = qs('#tx-account');
  {
    const accounts = state.catalogs?.accounts || [];
    accSel.innerHTML = accounts.map(a=> `<option value="${a.id}">${a.name}</option>`).join('');
    const defAcc = accounts.find(a => a.is_default) || accounts[0];
    if (defAcc) accSel.value = defAcc.id;
  }
  const pmSel = qs('#tx-payment');
  pmSel.innerHTML = (state.catalogs?.payment_methods||[]).map(p=> `<option value="${p.id}">${p.name}</option>`).join('');
  const ccSel = qs('#tx-cost-center');
  ccSel.innerHTML = (state.catalogs?.cost_centers||[]).map(c=> `<option value="${c.id}">${c.name}</option>`).join('');
}

function initHeader() {
  qs('#theme-toggle').addEventListener('click', toggleTheme);
  // Aplica avatar centrado, se existir; caso contrário, inicial
  const applyAvatar = () => {
    const btn = qs('#profile-btn');
    if (!btn) return;
    const url = state.user?.avatar_url;
    if (url) {
      btn.classList.add('avatar-btn');
      btn.style.backgroundImage = `url(${url})`;
      btn.textContent = '';
    } else {
      btn.classList.remove('avatar-btn');
      btn.style.backgroundImage = '';
      btn.textContent = (state.user?.name?.[0] || state.user?.email?.[0] || 'U').toUpperCase();
    }
  };
  applyAvatar();
  // Carrega avatar_url atual do perfil para refletir no header
  (async () => {
    const prof = await apiProfile('get');
    if (prof?.user) {
      state.user = { ...(state.user || {}), ...prof.user };
      applyAvatar();
    }
  })();
  qs('#profile-btn').addEventListener('click', () => {
    qs('#profile-menu').classList.toggle('hidden');
  });
  const editProfileBtn = qs('#edit-profile');
  if (editProfileBtn && !editProfileBtn._bound) {
    editProfileBtn._bound = true;
    editProfileBtn.addEventListener('click', () => {
      setRoute('profile');
      qs('#profile-menu').classList.add('hidden');
    });
  }
  qs('#logout').addEventListener('click', async () => {
    await apiAuth('logout', {});
    state.user = null;
    show('#auth-view');
  });
  const sidebar = qs('#sidebar');
  const overlay = qs('#sidebar-overlay');
  qs('#btn-menu').addEventListener('click', () => {
    // Em mobile o elemento possui 'hidden'; remova antes de abrir
    sidebar.classList.remove('hidden');
    sidebar.classList.add('open');
    overlay.classList.remove('hidden');
  });
  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.add('hidden');
    // Opcionalmente volte a esconder após fechar
    sidebar.classList.add('hidden');
  });
  qsa('.nav-link').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    const hash = a.getAttribute('href').replace('#', '');
    setRoute(hash);
    // Fechar menu em mobile
    if (overlay && !overlay.classList.contains('hidden')) {
      sidebar.classList.remove('open');
      overlay.classList.add('hidden');
      sidebar.classList.add('hidden');
    }
  }));
  // Atualiza rota ao mudar hash diretamente
  window.addEventListener('hashchange', () => {
    const r = (location.hash || '').replace('#','') || state.route;
    setRoute(r);
  });
}

// Dashboard
let lineChart, pieExpense, pieIncome;

function initDashboard() {
  // Populate year/month
  const yearSel = qs('#filter-year');
  const monthSel = qs('#filter-month');
  const now = new Date();
  const years = [now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1];
  yearSel.innerHTML = years.map(y=>`<option value="${y}">${y}</option>`).join('');
  monthSel.innerHTML = ['Todos','01','02','03','04','05','06','07','08','09','10','11','12'].map((m,i)=>`<option value="${i===0?'todos':m}">${i===0?'Todos':m}</option>`).join('');
  // Seleciona ano atual e mês "Todos" por padrão
  yearSel.value = String(now.getFullYear());
  monthSel.value = 'todos';
  ['filter-status','filter-cc','filter-year','filter-month'].forEach(id => {
    qs('#'+id).addEventListener('change', refreshDashboard);
  });
  bindFab();
  bindTxModal();
  refreshDashboard();
}

async function refreshDashboard() {
  const params = {
    company_id: state.currentCompanyId,
    status: qs('#filter-status').value,
    cost_center: qs('#filter-cc').value,
    year: qs('#filter-year').value,
    month: qs('#filter-month').value,
  };
  let data;
  try {
    data = DEV ? await apiDashboard(params) : await apiTransactions('list', params);
  } catch (e) {
    console.error('Erro no dashboard:', e);
  }
  if (!data || data.success === false || !data.summary) {
    // Evita TypeError e informa ao usuário sem quebrar a UI
    const msg = (data && data.message) ? data.message : 'A conexão com o banco de dados não pôde ser estabelecida.';
    alert(msg);
    const emptySummary = { income: 0, expense: 0, profit: 0, margin: 0 };
    const emptyTrend = { labels: [], income: [], expense: [] };
    const emptyCats = { expense: { labels: [], values: [] }, income: { labels: [], values: [] } };
    const emptyLast = [];
    qs('#card-income').textContent = formatBRL(0);
    qs('#card-expense').textContent = formatBRL(0);
    qs('#card-profit').textContent = formatBRL(0);
    qs('#card-margin').textContent = '0%';
    renderLineChart(emptyTrend);
    renderPieCharts(emptyCats);
    renderLastTransactions(emptyLast);
    return;
  }
  qs('#card-income').textContent = formatBRL(data.summary.income);
  qs('#card-expense').textContent = formatBRL(data.summary.expense);
  qs('#card-profit').textContent = formatBRL(data.summary.profit);
  qs('#card-margin').textContent = `${(data.summary.margin*100).toFixed(1)}%`;

  renderLineChart(data.trend);
  renderPieCharts(data.categories);
  renderLastTransactions(data.last_transactions);
}

function renderLineChart(trend) {
  const ctx = qs('#lineChart');
  const labels = trend.labels;
  const income = trend.income;
  const expense = trend.expense;
  // Atualiza título do gráfico com ano/mês selecionados
  const year = qs('#filter-year')?.value || '';
  const month = qs('#filter-month')?.value || 'todos';
  const yearEl = qs('#chart-year');
  if (yearEl) { yearEl.textContent = year || '—'; }
  if (lineChart) lineChart.destroy();
  const isDark = document.documentElement.classList.contains('dark');
  const gridColor = isDark ? 'rgba(226,232,240,0.15)' : 'rgba(100,116,139,0.2)';
  const tickColor = isDark ? '#e2e8f0' : '#334155';
  lineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Receitas', data: income, borderColor: '#2ecc71', backgroundColor: 'rgba(46,204,113,0.2)', tension: 0.3 },
        { label: 'Despesas', data: expense, borderColor: '#e74c3c', backgroundColor: 'rgba(231,76,60,0.2)', tension: 0.3 },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: tickColor } },
        y: { grid: { color: gridColor }, ticks: { color: tickColor } },
      },
      plugins: { legend: { position: 'top', labels: { color: tickColor } } }
    }
  });
}

function renderPieCharts(categories) {
  const ectx = qs('#pieExpense');
  const ictx = qs('#pieIncome');
  if (pieExpense) pieExpense.destroy();
  if (pieIncome) pieIncome.destroy();
  // Paleta de cores distinta e estável por rótulo
  const normalize = (s) => String(s||'').toLowerCase().trim();
  const colorForLabel = (label, baseHue) => {
    const str = normalize(label);
    let hash = 0; for (let i=0;i<str.length;i++) { hash = (hash*31 + str.charCodeAt(i)) & 0xffff; }
    const hue = (baseHue + (hash % 48) * 5) % 360; // espalha no espectro
    const sat = 55 + (hash % 35); // 55–90
    const light = 45 + (hash % 25); // 45–70
    return `hsl(${hue}, ${sat}%, ${light}%)`;
  };
  const expColors = (categories.expense.labels||[]).map(l => colorForLabel(l, 8));
  const incColors = (categories.income.labels||[]).map(l => colorForLabel(l, 120));
  pieExpense = new Chart(ectx, {
    type: 'doughnut',
    data: {
      labels: categories.expense.labels,
      datasets: [{ data: categories.expense.values, backgroundColor: expColors }]
    },
    options: { plugins: { legend: { labels: { color: document.documentElement.classList.contains('dark') ? '#e2e8f0' : '#334155' } } } }
  });
  pieIncome = new Chart(ictx, {
    type: 'doughnut',
    data: {
      labels: categories.income.labels,
      datasets: [{ data: categories.income.values, backgroundColor: incColors }]
    },
    options: { plugins: { legend: { labels: { color: document.documentElement.classList.contains('dark') ? '#e2e8f0' : '#334155' } } } }
  });
}

function renderLastTransactions(items) {
  const ul = qs('#last-transactions');
  ul.innerHTML = items.map(i => `
    <li class="flex justify-between items-center p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
      <span>${i.description}</span>
      <span class="${i.type==='income'?'text-income':'text-expense'}">${formatBRL(i.amount)}</span>
    </li>`).join('');
}

// Transações
function initTransactions() {
  // Ano/Mês
  const yearSel = qs('#tx-filter-year');
  const monthSel = qs('#tx-filter-month');
  const now = new Date();
  const years = [now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1];
  if (yearSel && monthSel) {
    yearSel.innerHTML = ['<option value="todos">Ano: Todos</option>'].concat(years.map(y=>`<option value="${y}">${y}</option>`)).join('');
    monthSel.innerHTML = ['Todos','01','02','03','04','05','06','07','08','09','10','11','12'].map((m,i)=>`<option value="${i===0?'todos':m}">${i===0?'Todos os meses':m}</option>`).join('');
    // Seleciona "Todos" e mês "Todos" por padrão (mostrar todas as transações)
    yearSel.value = 'todos';
    monthSel.value = 'todos';
  }
  // CC
  populateFiltersFromCatalogs();
  // Listeners
  ['tx-filter-status','tx-filter-cc','tx-filter-category','tx-filter-year','tx-filter-month'].forEach(id => {
    const el = qs('#'+id); if (el) el.addEventListener('change', refreshTransactions);
  });
  // Paginação
  const sizeSel = qs('#tx-page-size');
  const btnPrev = qs('#tx-page-prev');
  const btnNext = qs('#tx-page-next');
  if (sizeSel) {
    sizeSel.value = String(state.txPageSize);
    sizeSel.addEventListener('change', () => {
      state.txPageSize = parseInt(sizeSel.value || '10', 10);
      state.txPage = 1;
      renderTxTable(state.transactions);
    });
  }
  if (btnPrev) btnPrev.addEventListener('click', () => { if (state.txPage > 1) { state.txPage--; renderTxTable(state.transactions); } });
  if (btnNext) btnNext.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil((state.transactions||[]).length / state.txPageSize));
    if (state.txPage < totalPages) { state.txPage++; renderTxTable(state.transactions); }
  });
  // Import
  const btnImport = qs('#btn-import');
  if (btnImport) btnImport.addEventListener('click', () => qs('#import-modal').classList.remove('hidden'));
  bindImportModal();
  // Modal já está ligado no initDashboard
  refreshTransactions();
}

async function refreshTransactions() {
  const yearVal = qs('#tx-filter-year').value;
  const monthVal = qs('#tx-filter-month').value;
  const params = {
    company_id: state.currentCompanyId,
    status: ['income','expense'].includes(qs('#tx-filter-status').value) ? 'todas' : qs('#tx-filter-status').value,
    type: ['income','expense'].includes(qs('#tx-filter-status').value) ? qs('#tx-filter-status').value : null,
    cost_center: qs('#tx-filter-cc').value,
    category_id: qs('#tx-filter-category').value,
  };
  // Filtros de ano/mês:
  // - Se ano != 'todos', envia ano e mês (mês pode ser 'todos')
  // - Se ano == 'todos' e mês != 'todos', envia apenas mês (valendo para todos os anos)
  if (yearVal && yearVal !== 'todos') {
    params.year = yearVal;
    params.month = monthVal;
  } else if (monthVal && monthVal !== 'todos') {
    params.month = monthVal;
  }
  const data = await apiTransactions('list', params);
  state.transactions = data.items || [];
  state.txPage = 1; // volta para primeira página ao atualizar lista
  renderTxTable(state.transactions);
}

function renderTxTable(items) {
  const tbody = qs('#tx-table-body');
  const cats = state.catalogs?.categories || [];
  const catName = (id) => (cats.find(c=> c.id===id)?.name || '-');
  // Paginação
  const pageSize = state.txPageSize || 10;
  const total = (items||[]).length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (state.txPage > totalPages) state.txPage = totalPages;
  const start = (state.txPage - 1) * pageSize;
  const end = start + pageSize;
  const slice = (items||[]).slice(start, end);

  tbody.innerHTML = slice.map(t => `
    <tr class="border-b border-slate-200 dark:border-slate-700">
      <td class="py-2 pr-3"><input type="checkbox" class="tx-select" data-id="${t.id}" /></td>
      <td class="py-2 pr-3">${formatISOToBR(t.date)}</td>
      <td class="py-2 pr-3">${t.description}</td>
      <td class="py-2 pr-3">${catName(t.category_id)}</td>
      <td class="py-2 pr-3 ${t.type==='income'?'text-income':'text-expense'}">${formatBRL(t.amount)}</td>
      <td class="py-2 pr-3"><span class="pill ${t.status ? 'pill-green' : 'pill-gray'}">${t.status?'Pago':'Pendente'}</span></td>
      <td class="py-2 pr-3">
        <button title="${t.status?'Marcar como pendente':'Marcar como pago'}" class="px-2 py-1 rounded hover:${t.status?'text-red-700':'text-green-700'} bg-slate-100 dark:bg-slate-700 mr-2 btn-toggle-tx" style="color:${t.status?'#ff2c2c':'#008f39'}" data-id="${t.id}">${t.status?'⟳':'✓ Pagar'}</button>
        <button class="px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 mr-2 btn-edit-tx" data-id="${t.id}">✏️</button>
        <button class="px-2 py-1 rounded bg-red-100 dark:bg-red-900/40 text-red-600 btn-del-tx" data-id="${t.id}">🗑️</button>
      </td>
    </tr>
  `).join('');
  // Atualiza info de paginação
  const infoEl = qs('#tx-page-info');
  const prevEl = qs('#tx-page-prev');
  const nextEl = qs('#tx-page-next');
  if (infoEl) infoEl.textContent = `Página ${Math.min(state.txPage, totalPages)} de ${totalPages}`;
  if (prevEl) prevEl.disabled = state.txPage <= 1;
  if (nextEl) nextEl.disabled = state.txPage >= totalPages;
  // Bind ações
  const massbar = qs('#tx-massbar');
  const selCount = qs('#tx-selected-count');
  const updateMassbar = () => {
    const count = qsa('.tx-select:checked').length;
    selCount.textContent = count;
    massbar.classList.toggle('hidden', count === 0);
  };
  const selectAllEl = qs('#tx-select-all');
  if (selectAllEl) selectAllEl.addEventListener('change', () => {
    qsa('.tx-select').forEach(cb => { cb.checked = selectAllEl.checked; });
    updateMassbar();
  });
  qsa('.tx-select').forEach(cb => cb.addEventListener('change', updateMassbar));
  qsa('.btn-edit-tx').forEach(btn => {
    const id = btn.dataset.id;
    const tx = items.find(it => String(it.id) === String(id));
    btn.addEventListener('click', () => {
      if (!tx) { alert('Transação não encontrada para edição.'); return; }
      openTxModal(tx);
    });
  });
  qsa('.btn-toggle-tx').forEach(btn => {
    const id = btn.dataset.id;
    const tx = items.find(it => String(it.id) === String(id));
    btn.addEventListener('click', async () => {
      if (!tx) { alert('Transação não encontrada ao atualizar status.'); return; }
      const res = await apiTransactions('update', { id, status: !Boolean(tx.status) });
      if (res.success) {
        await refreshTransactions();
      } else {
        alert(res.message || 'Erro ao atualizar status');
      }
    });
  });
  qsa('.btn-del-tx').forEach(btn => {
    const id = btn.dataset.id;
    btn.addEventListener('click', async () => {
      if (confirm('Excluir esta transação?')) {
        const res = await apiTransactions('delete', { id });
        if (res.success) {
          await refreshTransactions();
        } else {
          alert(res.message || 'Erro ao excluir transação');
        }
      }
    });
  });
  const btnDelSelected = qs('#tx-delete-selected');
  if (btnDelSelected) btnDelSelected.addEventListener('click', async () => {
    const ids = qsa('.tx-select:checked').map(cb => cb.dataset.id);
    if (!ids.length) return;
    if (!confirm(`Excluir ${ids.length} selecionada(s)?`)) return;
    for (const id of ids) { await apiTransactions('delete', { id }); }
    await refreshTransactions();
  });
}

// FAB and Modal

function bindFab() {
  const fab = qs('#fab');
  const menu = qs('#fab-menu');
  fab.addEventListener('click', () => menu.classList.toggle('hidden'));
  qs('#add-income').addEventListener('click', () => openTxModal('income'));
  qs('#add-expense').addEventListener('click', () => openTxModal('expense'));
}

function bindTxModal() {
  const modal = qs('#tx-modal');
  const close = () => modal.classList.add('hidden');
  qs('#tx-close').addEventListener('click', close);
  qs('#tx-cancel').addEventListener('click', close);
  const paymentSel = qs('#tx-payment');
  const feeWrap = qs('#tx-fee-wrapper');
  const feeSel = qs('#tx-fee');
  const amountInput = qs('input[name="amount"]');
  const dateInput = qs('#tx-date') || qs('input[name="date"]');
  // Attach masks
  attachCurrencyMask(amountInput);
  attachDateMask(dateInput);
  paymentSel.addEventListener('change', () => {
    const pm = (state.catalogs?.payment_methods||[]).find(p=> p.id===paymentSel.value);
    const fees = pm?.fees||[];
    feeWrap.classList.toggle('hidden', fees.length===0);
    feeSel.innerHTML = fees.map(f=> `<option value="${f.percent}">${f.name}</option>`).join('');
    updateNetAmount();
  });
  feeSel.addEventListener('change', updateNetAmount);
  amountInput.addEventListener('input', updateNetAmount);
  function updateNetAmount() {
    const v = parseBRLToFloat(amountInput.value || '0');
    const fee = parseFloat(feeSel.value || '0') || 0;
    const net = v * (1 - fee);
    qs('#tx-net').textContent = `Valor líquido: ${formatBRL(net)}`;
  }
  // Subcategoria dinâmica conforme categoria
  const catSel = qs('#tx-category');
  const subSel = qs('#tx-subcategory');
  catSel.addEventListener('change', () => {
    const cat = (state.catalogs?.categories||[]).find(c=> c.id===catSel.value);
    const subs = cat?.subcategories||[];
    subSel.classList.toggle('hidden', subs.length===0);
    subSel.innerHTML = subs.map(s=> `<option value="${s.id}">${s.name}</option>`).join('');
  });

  // Submit
  const formEl = qs('#tx-form');
  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(formEl);
    const payload = {
      company_id: state.currentCompanyId,
      type: fd.get('type'),
      description: fd.get('description'),
      amount: parseBRLToFloat(fd.get('amount')),
      date: parseBRToISO(fd.get('date')),
      account_id: fd.get('account_id'),
      category_id: fd.get('category_id'),
      subcategory_id: fd.get('subcategory_id') || null,
      cost_center_id: fd.get('cost_center_id') || null,
      payment_method_id: fd.get('payment_method_id') || null,
      fee_percent: parseFloat(fd.get('fee_percent') || '0') || 0,
      status: fd.get('status') ? true : false,
    };
    let res;
    if (formEl.dataset.mode === 'edit' && formEl.dataset.id) {
      res = await apiTransactions('update', { id: formEl.dataset.id, ...payload });
    } else {
      res = await apiTransactions('create', payload);
    }
    if (res.success) {
      modal.classList.add('hidden');
      if (state.route === 'transactions') {
        await refreshTransactions();
      } else {
        await refreshDashboard();
      }
    } else {
      alert(res.message || 'Erro ao salvar transação');
    }
  });
}

function openTxModal(arg) {
  const formEl = qs('#tx-form');
  const isEdit = typeof arg === 'object' && arg && arg.id;
  const type = isEdit ? arg.type : arg;
  qs('#tx-modal-title').textContent = isEdit ? 'Editar Transação' : (type === 'income' ? 'Adicionar Receita' : 'Adicionar Despesa');
  qs('#tx-type').value = type;
  const cats = (state.catalogs?.categories||[]).filter(c=> c.type === (type==='income' ? 'income' : 'expense'));
  qs('#tx-category').innerHTML = cats.map(c=> `<option value="${c.id}">${c.name}</option>`).join('');
  // subcategorias conforme categoria
  qs('#tx-category').dispatchEvent(new Event('change'));
  const dateInput = qs('#tx-date') || qs('input[name="date"]');
  const statusCheckbox = formEl.querySelector('input[name="status"]');
  
  if (isEdit) {
    formEl.dataset.mode = 'edit';
    formEl.dataset.id = arg.id;
    qs('input[name="description"]').value = arg.description || '';
    // Prefill com máscara de moeda para melhor UX
    qs('input[name="amount"]').value = formatBRL(arg.amount || 0);
    dateInput.value = formatISOToBR(arg.date || '');
    qs('#tx-account').value = arg.account_id || '';
    qs('#tx-category').value = arg.category_id || '';
    qs('#tx-category').dispatchEvent(new Event('change'));
    if (arg.subcategory_id) { qs('#tx-subcategory').value = arg.subcategory_id; }
    qs('#tx-cost-center').value = arg.cost_center_id || '';
    qs('#tx-payment').value = arg.payment_method_id || '';
    qs('#tx-payment').dispatchEvent(new Event('change'));
    qs('#tx-fee').value = arg.fee_percent || '0';
    if (statusCheckbox) {
      statusCheckbox.checked = !!arg.status;
    }
  } else {
    formEl.dataset.mode = 'create';
    formEl.dataset.id = '';
    formEl.reset();
    qs('#tx-type').value = type;
    const today = new Date().toISOString().slice(0,10);
    dateInput.value = formatISOToBR(today);
    qs('#tx-payment').dispatchEvent(new Event('change'));
    if (statusCheckbox) {
      statusCheckbox.checked = false;
    }
  }
  qs('#tx-modal').classList.remove('hidden');
}



// Boot
async function checkAppVersion() {
  try {
    const res = await fetch('/api/version.php');
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = null; }
    const serverVer = String((data && data.version) || '');
    const localVer = localStorage.getItem('appVersion') || '';
    if (serverVer && serverVer !== localVer) {
      try { localStorage.setItem('appVersion', serverVer); } catch (e) {}
      const hash = location.hash || '';
      // Reload to fetch new assets that carry ?v tokens
      location.replace(location.pathname + hash);
    }
  } catch (e) {
    console.warn('Falha ao verificar versão:', e);
  }
}
async function boot() { // Transformada em async
    initTheme();
    await checkAppVersion();
    bindAuthUI();
    bindOnboardingUI();

    // LÓGICA DE VERIFICAÇÃO DE SESSÃO
    try {
      if (DEV) {
          state.user = { id: 'devuser', name: 'Usuário Dev', email: 'dev@example.com' };
          state.companies = [{ id: 'cmp_dev', name: 'Empresa Dev' }];
          state.currentCompanyId = 'cmp_dev';
          await enterApp();
      } else {
          // Tenta encontrar uma sessão ativa no backend
          const res = await fetch('/api/auth.php?action=check-session');
          const text = await res.text();
          let sessionData;
          try { sessionData = JSON.parse(text); }
          catch(e) { console.warn('check-session não retornou JSON. Exibindo login.', text); sessionData = { success: false }; }

          if (sessionData && sessionData.success) {
              // Sessão encontrada! Pula a tela de login
              state.user = sessionData.user;
              await postLogin();
          } else {
              // Nenhuma sessão, mostra a tela de login
              show('#auth-view');
          }
      }
    } catch (err) {
      console.error('Falha no boot de produção:', err);
      show('#auth-view');
    }
    // === MOBILE SIDEBAR TOGGLE ===
    const toggle = document.querySelector('#menuToggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');

    if (toggle && sidebar) {
      toggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        if (overlay) overlay.classList.toggle('active');
      });
    }

    if (overlay) {
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
      });
    }
}

document.addEventListener('DOMContentLoaded', boot);
function bindImportModal() {
  const modal = qs('#import-modal');
  const close = () => modal.classList.add('hidden');
  const btnClose = qs('#import-close');
  const btnCancel = qs('#import-cancel');
  [btnClose, btnCancel].forEach(el => el && el.addEventListener('click', close));
  const fileInput = qs('#import-file');
  const errorsEl = qs('#import-errors');
  const summaryEl = qs('#import-summary');
  const saveBtn = qs('#import-save');
  let validItems = [];
  const pmList = state.catalogs?.payment_methods || [];
  const ccList = state.catalogs?.cost_centers || [];
  const catList = state.catalogs?.categories || [];
  const accounts = state.catalogs?.accounts || [];
  function findByName(arr, name) { return arr.find(a => a.name.toLowerCase() === String(name||'').toLowerCase().trim()); }
  function findFeePercent(pmName, feeDesc) {
    const pm = findByName(pmList, pmName);
    if (!pm) return 0;
    const fee = (pm.fees||[]).find(f => f.name.toLowerCase() === String(feeDesc||'').toLowerCase().trim());
    return fee ? (fee.percent || 0) : 0;
  }
  fileInput && fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      // Reset UI
      errorsEl.innerHTML = '';
      summaryEl.textContent = '';
      saveBtn.textContent = 'Salvar Transações Válidas';
      saveBtn.disabled = true;
      saveBtn.dataset.mode = 'save';
      validItems = [];
      // --- CSV parsing robusto com suporte a campos entre aspas e vírgulas internas ---
      function parseCSV(str) {
        const rows = [];
        let row = [];
        let field = '';
        let inQuotes = false;
        for (let i = 0; i < str.length; i++) {
          const ch = str[i];
          if (inQuotes) {
            if (ch === '"') {
              if (str[i+1] === '"') { field += '"'; i++; } else { inQuotes = false; }
            } else {
              field += ch;
            }
          } else {
            if (ch === '"') { inQuotes = true; }
            else if (ch === ',') { row.push(field.trim()); field = ''; }
            else if (ch === '\n') { row.push(field.trim()); rows.push(row); row = []; field = ''; }
            else if (ch === '\r') { /* ignore */ }
            else { field += ch; }
          }
        }
        // push último campo/linha
        if (field.length > 0 || row.length > 0) { row.push(field.trim()); rows.push(row); }
        // remove linhas vazias
        const filtered = rows.filter(r => r.some(c => String(c).trim().length > 0));
        return { header: (filtered[0]||[]).map(h => h.trim()), rows: filtered.slice(1) };
      }
      // Número brasileiro: remove milhares e trata decimal
      function parseBRNumber(s) {
        let v = String(s || '').replace(/[^0-9.,-]/g, '').trim();
        if (!v) return NaN;
        if (v.includes(',')) {
          v = v.replace(/\./g, '').replace(',', '.');
        } else {
          // sem vírgula: se tiver apenas pontos como milhares (ex: 1.500), remover
          const parts = v.split('.');
          if (parts.length > 1 && parts.every(p => /^\d+$/.test(p))) {
            v = parts.join('');
          }
        }
        return parseFloat(v);
      }
      // Data: aceita dd/mm/yyyy e yyyy-mm-dd; normaliza para ISO
      function normalizeDate(input) {
        const s = String(input || '').trim();
        const isoMatch = s.match(/^\d{4}-\d{2}-\d{2}$/);
        if (isoMatch) return s;
        const br = s.match(/^([0-3]?\d)\/(0?\d|1[0-2])\/(\d{4})$/);
        if (br) {
          const d = parseInt(br[1], 10); const m = parseInt(br[2], 10); const y = parseInt(br[3], 10);
          const dt = new Date(y, m-1, d);
          if (dt.getFullYear() === y && dt.getMonth() === m-1 && dt.getDate() === d) {
            return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          }
        }
        return '';
      }

      const parsed = parseCSV(text);
      const header = parsed.header;
      const rows = parsed.rows;
      validItems = []; const errors = [];
      // Normalização de cabeçalhos (remove acentos/espacos/_ e lower)
      const norm = (s) => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[\s_]/g,'');
      const headerNorm = header.map(h=> norm(h));
      const idxOf = (aliases) => {
        const arr = Array.isArray(aliases) ? aliases : [aliases];
        for (const nm of arr) {
          const i = headerNorm.indexOf(norm(nm));
          if (i !== -1) return i;
        }
        return -1;
      };
      const requiredAliases = {
        Data: ['Data','Date'],
        Tipo: ['Tipo','Type'],
        Descricao: ['Descricao','Descrição','Description'],
        Valor: ['Valor','Amount'],
        Categoria: ['Categoria','Category']
      };
      const hasRequired = Object.values(requiredAliases).every(al => idxOf(al) !== -1);
      if (!hasRequired) {
        errors.push(`Cabeçalho inválido. Campos mínimos: Data, Tipo, Descrição, Valor, Categoria`);
      }
      for (let i = 0; i < rows.length; i++) {
        const cols = rows[i];
        const get = (nameOrAliases) => {
          const idx = idxOf(nameOrAliases);
          return idx >= 0 ? (cols[idx] || '') : '';
        };
        const rowErrors = [];
        const dateStr = get(['Data','Date']);
        const date = normalizeDate(dateStr);
        const typeStr = get(['Tipo','Type']);
        const description = get(['Descricao','Descrição','Description']);
        const amountStr = get(['Valor','Amount']);
        const amount = parseBRNumber(amountStr);
        const categoryName = get(['Categoria','Category']);
        const ccName = get(['CentroDeCusto','Centro de Custo','Centro_Custo','Cost Center','CostCenter','CentroCusto','CC']);
        const accountName = get(['Conta','Account']);
        const pmName = get(['FormaDePagamento','Forma de Pagamento','Pagamento','FormaPagamento']);
        const feeDesc = get(['DescricaoTaxa','Taxa','DescricaoTaxaMaquininha']);
        const statusStr = get(['Status']);
        const type = typeStr.toLowerCase().includes('rece') ? 'income' : 'expense';
        if (!date) rowErrors.push('Data inválida (dd/mm/yyyy ou YYYY-MM-DD)');
        if (!description) rowErrors.push('Descrição vazia');
        if (!(amount>0)) rowErrors.push('Valor inválido');
        const cat = findByName(catList, categoryName);
        if (!cat) rowErrors.push(`Categoria '${categoryName}' não encontrada`);
        const cc = ccName ? findByName(ccList, ccName) : null;
        if (ccName && !cc) rowErrors.push(`Centro de Custo '${ccName}' não encontrado`);
        const acc = accountName ? findByName(accounts, accountName) : null;
        if (accountName && !acc) rowErrors.push(`Conta '${accountName}' não encontrada`);
        const fee_percent = findFeePercent(pmName, feeDesc);
        const status = String(statusStr||'').toLowerCase().includes('real') ? true : false;
        if (rowErrors.length) {
          errors.push(`Linha ${i+2}: ${rowErrors.join('; ')}`); // +2 considerando cabeçalho
        } else {
          validItems.push({
            company_id: state.currentCompanyId,
            type, description, amount, date,
            account_id: acc?.id || accounts[0]?.id,
            category_id: cat?.id,
            subcategory_id: null,
            cost_center_id: cc?.id || null,
            payment_method_id: findByName(pmList, pmName)?.id || null,
            fee_percent,
            status,
          });
        }
      }
      summaryEl.textContent = `${validItems.length} transações válidas • ${errors.length} erros`;
      errorsEl.innerHTML = errors.map(e=> `<li>${e}</li>`).join('');
      if (errors.length > 0) {
        // Bloqueia salvamento quando há QUALQUER erro e permite escolher outro arquivo
        saveBtn.textContent = 'Escolher outro arquivo';
        saveBtn.dataset.mode = 'retry';
        saveBtn.disabled = false;
      } else {
        saveBtn.textContent = 'Salvar Transações Válidas';
        saveBtn.dataset.mode = 'save';
        saveBtn.disabled = validItems.length === 0;
      }
    };
    reader.readAsText(file);
  });
  saveBtn && saveBtn.addEventListener('click', async () => {
    if (saveBtn.dataset.mode === 'retry') {
      // Abrir seleção para novo arquivo
      fileInput.value = '';
      validItems = [];
      errorsEl.innerHTML = '';
      summaryEl.textContent = '';
      saveBtn.textContent = 'Salvar Transações Válidas';
      saveBtn.dataset.mode = 'save';
      saveBtn.disabled = true;
      fileInput.click();
      return;
    }
    if (saveBtn.dataset.mode !== 'save' || validItems.length === 0) return;
    // Somente salva se NÃO houver erros no arquivo inteiro
    for (const item of validItems) { await apiTransactions('create', item); }
    close();
    await refreshTransactions();
  });
}
// Accounts (Bank Statement)
function initAccounts() {
  const yearSel = qs('#acc-year');
  const monthSel = qs('#acc-month');
  const now = new Date();
  const years = [now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1];
  yearSel.innerHTML = years.map(y=>`<option value="${y}">${y}</option>`).join('');
  monthSel.innerHTML = ['Todos','01','02','03','04','05','06','07','08','09','10','11','12']
    .map((m,i)=>`<option value="${i===0?'todos':m}">${i===0?'Todos':m}</option>`).join('');
  // Defaults: ano atual e mês "Todos"
  yearSel.value = String(now.getFullYear());
  monthSel.value = 'todos';
  ['acc-select','acc-year','acc-month'].forEach(id => qs('#'+id).addEventListener('change', refreshAccounts));
  // Paginação de contas
  const sizeSel = qs('#acc-page-size');
  const btnPrev = qs('#acc-page-prev');
  const btnNext = qs('#acc-page-next');
  if (sizeSel) {
    sizeSel.value = String(state.accPageSize);
    sizeSel.addEventListener('change', () => {
      state.accPageSize = parseInt(sizeSel.value || '10', 10);
      state.accPage = 1;
      renderAccountStatement(state.accItems, state.accOpening);
    });
  }
  if (btnPrev) btnPrev.addEventListener('click', () => { if (state.accPage > 1) { state.accPage--; renderAccountStatement(state.accItems, state.accOpening); } });
  if (btnNext) btnNext.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil((state.accItems||[]).length / state.accPageSize));
    if (state.accPage < totalPages) { state.accPage++; renderAccountStatement(state.accItems, state.accOpening); }
  });
  refreshAccounts();
}

async function refreshAccounts() {
  const accId = qs('#acc-select')?.value;
  const year = qs('#acc-year')?.value;
  const month = qs('#acc-month')?.value;
  if (!accId) return;
  const params = {
    company_id: state.currentCompanyId,
    status: 'realizado',
    year,
    month: 'todos',
  };
  const data = await apiTransactions('list', params);
  const all = (data.items||[]).filter(t=> t.account_id === accId);
  // Initial balance at start of selected period
  const acc = (state.catalogs?.accounts||[]).find(a => a.id === accId);
  const initialBalance = parseFloat(acc?.initial_balance || 0) || 0;
  let initial = initialBalance;
  if (month !== 'todos') {
    const periodStart = `${year}-${month}-01`;
    const priorMovements = all
      .filter(t=> t.date < periodStart)
      .reduce((sum,t)=> sum + (t.type==='income' ? (t.amount - (t.fee_percent ? t.amount*t.fee_percent : 0)) : -t.amount), 0);
    initial += priorMovements;
  }
  // Movements within selected period
  const monthItems = all.filter(t=> {
    if (month==='todos') return String(t.date).startsWith(`${year}-`);
    return String(t.date).startsWith(`${year}-${month}`);
  }).sort((a,b)=> a.date.localeCompare(b.date));
  let closing = initial;
  for (const t of monthItems) {
    const net = t.type==='income' ? (t.amount - (t.fee_percent ? t.amount*t.fee_percent : 0)) : -t.amount;
    closing += net;
  }
  qs('#acc-opening').textContent = formatBRL(initial);
  qs('#acc-closing').textContent = formatBRL(closing);
  state.accItems = monthItems;
  state.accOpening = initial;
  state.accPage = 1;
  renderAccountStatement(state.accItems, state.accOpening);
}

function renderAccountStatement(items, opening) {
  const tbody = qs('#acc-table-body');
  const pageSize = state.accPageSize || 10;
  const total = (items||[]).length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (state.accPage > totalPages) state.accPage = totalPages;
  const start = (state.accPage - 1) * pageSize;
  const end = start + pageSize;
  const slice = (items||[]).slice(start, end);
  // Running starts from opening plus prior movements before current page
  let running = opening;
  for (let i = 0; i < start; i++) {
    const t = items[i];
    const fee = (t.fee_percent ? t.amount*t.fee_percent : 0);
    const net = t.type==='income' ? (t.amount - fee) : -t.amount;
    running += net;
  }
  const catMap = Object.fromEntries((state.catalogs?.categories||[]).map(c=> [c.id, c.name]));
  tbody.innerHTML = slice.map(t=> {
    const fee = (t.fee_percent ? t.amount*t.fee_percent : 0);
    const net = t.type==='income' ? (t.amount - fee) : -t.amount;
    running += net;
    const typeLabel = t.type==='income' ? 'Receita' : 'Despesa';
    const valClass = net >= 0 ? 'text-income' : 'text-expense';
    return `
      <tr class="border-b border-slate-100 dark:border-slate-700">
        <td class="py-2 pr-3">${formatISOToBR(t.date)}</td>
        <td class="py-2 pr-3">${t.description}</td>
        <td class="py-2 pr-3">${catMap[t.category_id]||'—'}</td>
        <td class="py-2 pr-3">${typeLabel}</td>
        <td class="py-2 pr-3 ${valClass}">${formatBRL(net)}</td>
        <td class="py-2 pr-3">${formatBRL(running)}</td>
      </tr>`;
  }).join('');
  // Atualiza paginação UI
  const infoEl = qs('#acc-page-info');
  const prevEl = qs('#acc-page-prev');
  const nextEl = qs('#acc-page-next');
  const counterEl = qs('#acc-counter');
  if (infoEl) infoEl.textContent = `Página ${Math.min(state.accPage, totalPages)} de ${totalPages}`;
  if (prevEl) prevEl.disabled = state.accPage <= 1;
  if (nextEl) nextEl.disabled = state.accPage >= totalPages;
  if (counterEl) {
    const from = total === 0 ? 0 : start + 1;
    const to = Math.min(end, total);
    counterEl.textContent = `Exibindo ${from}–${to} de ${total}`;
  }
}

// --- Catalogs screen ---
function initCatalogs() {
  const tabs = qsa('#view-catalogs .tab');
  const panels = qsa('#view-catalogs .tab-panel');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      panels.forEach(p => p.classList.add('hidden'));
      const id = `#tab-${btn.dataset.tab}`;
      const panel = qs(id);
      if (panel) panel.classList.remove('hidden');
    });
  });

  loadCatalogs().then(() => {
    populateCatalogDropdowns();
    refreshCatalogLists();
    bindCatalogForms();
    bindCatalogDeletesAndEdits();
    bindCatalogDefaultToggle();
  });
}

function populateCatalogDropdowns() {
  const cats = state.catalogs?.categories || [];
  const subcatSel = qs('#subcat-category');
  if (subcatSel) subcatSel.innerHTML = cats.map(c => `<option value="${c.id}">${c.name} (${c.type==='income'?'receita':'despesa'})</option>`).join('');
}

async function refreshCatalogLists() {
  const [cats, subs, ccs, accs, pms, fees] = await Promise.all([
    apiCatalogsCRUD('categories','list'),
    apiCatalogsCRUD('subcategories','list'),
    apiCatalogsCRUD('cost_centers','list'),
    apiCatalogsCRUD('accounts','list'),
    apiCatalogsCRUD('payment_methods','list'),
    apiCatalogsCRUD('fees','list'),
  ]);
  renderCategoriesList(cats.items || []);
  renderSubcategoriesList(subs.items || []);
  renderCostCentersList(ccs.items || []);
  renderAccountsList(accs.items || []);
  renderPaymentMethodsWithFees(pms.items || [], fees.items || []);
  bindCatalogDeletesAndEdits();
}

function renderCatalogTable(entity, items) {
  const map = {
    categories: '#tbl-categories',
    subcategories: '#tbl-subcategories',
    cost_centers: '#tbl-costcenters',
    accounts: '#tbl-accounts',
    payment_methods: '#tbl-payments',
    fees: '#tbl-fees',
  };
  const tbody = qs(map[entity]);
  if (!tbody) return;
  tbody.innerHTML = '';
  items.forEach(item => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-100 dark:border-slate-700';
    let cols = '';
    if (entity === 'categories') cols = `<td class="py-2 pr-3">${item.name}</td><td class="py-2 pr-3">${item.type==='income'?'Receita':'Despesa'}</td>`;
    if (entity === 'subcategories') cols = `<td class="py-2 pr-3">${item.category_name}</td><td class="py-2 pr-3">${item.name}</td>`;
    if (entity === 'cost_centers') cols = `<td class="py-2 pr-3">${item.name}</td>`;
    if (entity === 'accounts') cols = `<td class="py-2 pr-3">${item.name}</td>`;
    if (entity === 'payment_methods') cols = `<td class="py-2 pr-3">${item.name}</td>`;
    if (entity === 'fees') cols = `<td class="py-2 pr-3">${item.payment_method_name}</td><td class="py-2 pr-3">${item.name}</td><td class="py-2 pr-3">${(item.percent*100).toFixed(2)}%</td>`;
    tr.innerHTML = `${cols}<td class="py-2 pr-3"><button class="btn-secondary btn-del" data-entity="${entity}" data-id="${item.id}" ${entity==='subcategories'?`data-category_id="${item.category_id}"`:''} ${entity==='fees'?`data-payment_method_id="${item.payment_method_id}"`:''}>Excluir</button></td>`;
    tbody.appendChild(tr);
  });
}

// === New renderers for redesigned Catalogs UI ===
function renderCategoriesList(items) {
  const incUl = qs('#list-categories-income');
  const expUl = qs('#list-categories-expense');
  if (!incUl || !expUl) return;
  incUl.innerHTML = '';
  expUl.innerHTML = '';
  items.forEach(item => {
    const li = document.createElement('li');
    li.className = 'flex flex-col py-1 border-b border-slate-100 dark:border-slate-700';
    li.innerHTML = `
      <div class="view flex items-center justify-between">
        <span class="item-name">${item.name}</span>
        <div class="flex items-center gap-2">
          <button class="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 btn-edit" data-entity="categories" data-id="${item.id}">✏️</button>
          <button class="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 btn-del" data-entity="categories" data-id="${item.id}">🗑️</button>
        </div>
      </div>
      <div class="edit hidden mt-2 flex items-center gap-2">
        <input type="text" class="input flex-1 edit-input" value="${item.name}" />
        <button class="btn-primary btn-save" data-entity="categories" data-id="${item.id}">✓</button>
        <button class="btn-secondary btn-cancel">×</button>
      </div>`;
    (item.type === 'income' ? incUl : expUl).appendChild(li);
  });
}

function renderSubcategoriesList(items) {
  const ul = qs('#list-subcategories');
  if (!ul) return;
  ul.innerHTML = '';
  items.forEach(item => {
    const li = document.createElement('li');
    li.className = 'flex flex-col py-1 border-b border-slate-100 dark:border-slate-700';
    const badgeClass = item.category_type === 'income' ? 'pill pill-green' : 'pill pill-red';
    const typeLabel = item.category_type === 'income' ? 'receita' : 'despesa';
    li.innerHTML = `
      <div class="view flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="item-name">${item.name}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="${badgeClass}">${item.category_name} (${typeLabel})</span>
          <button class="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 btn-edit" data-entity="subcategories" data-id="${item.id}">✏️</button>
          <button class="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 btn-del" data-entity="subcategories" data-id="${item.id}" data-category_id="${item.category_id}">🗑️</button>
        </div>
      </div>
      <div class="edit hidden mt-2 flex items-center gap-2">
        <input type="text" class="input flex-1 edit-input" value="${item.name}" />
        <button class="btn-primary btn-save" data-entity="subcategories" data-id="${item.id}">✓</button>
        <button class="btn-secondary btn-cancel">×</button>
      </div>`;
    ul.appendChild(li);
  });
}

function renderCostCentersList(items) {
  const ul = qs('#list-costcenters');
  if (!ul) return;
  ul.innerHTML = '';
  items.forEach(item => {
    const li = document.createElement('li');
    li.className = 'flex flex-col py-1 border-b border-slate-100 dark:border-slate-700';
    li.innerHTML = `
      <div class="view flex items-center justify-between">
        <span class="item-name">${item.name}</span>
        <div class="flex items-center gap-2">
          <button class="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 btn-edit" data-entity="cost_centers" data-id="${item.id}">✏️</button>
          <button class="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 btn-del" data-entity="cost_centers" data-id="${item.id}">🗑️</button>
        </div>
      </div>
      <div class="edit hidden mt-2 flex items-center gap-2">
        <input type="text" class="input flex-1 edit-input" value="${item.name}" />
        <button class="btn-primary btn-save" data-entity="cost_centers" data-id="${item.id}">✓</button>
        <button class="btn-secondary btn-cancel">×</button>
      </div>`;
    ul.appendChild(li);
  });
}

function renderAccountsList(items) {
  const ul = qs('#list-accounts');
  if (!ul) return;
  ul.innerHTML = '';
  items.forEach(item => {
    const li = document.createElement('li');
    li.className = 'flex flex-col py-1 border-b border-slate-100 dark:border-slate-700';
    const balance = typeof item.initial_balance !== 'undefined' ? formatBRL(parseFloat(item.initial_balance)) : formatBRL(0);
    const starIcon = item.is_default ? '⭐' : '☆';
    li.innerHTML = `
      <div class="view flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="item-name">${item.name}</span>
          <span class="text-sm text-slate-500">${balance}</span>
        </div>
        <div class="flex items-center gap-2">
          <button class="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 btn-default" data-entity="accounts" data-id="${item.id}" title="Definir como padrão">${starIcon}</button>
          <button class="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 btn-edit" data-entity="accounts" data-id="${item.id}">✏️</button>
          <button class="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 btn-del" data-entity="accounts" data-id="${item.id}">🗑️</button>
        </div>
      </div>
      <div class="edit hidden mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
        <input type="text" class="input md:col-span-2 edit-input" value="${item.name}" />
        <input type="text" class="input edit-balance" value="${balance.replace(/[^0-9.,-]/g,'')}" placeholder="Saldo Inicial (R$)" />
        <button class="btn-primary btn-save" data-entity="accounts" data-id="${item.id}">✓</button>
        <button class="btn-secondary btn-cancel">×</button>
      </div>`;
    ul.appendChild(li);
  });
}

function renderPaymentMethodsWithFees(paymentMethods, fees) {
  const ul = qs('#list-payments');
  const cardsWrap = qs('#cards-machines');
  if (ul) ul.innerHTML = '';
  if (cardsWrap) cardsWrap.innerHTML = '';

  const feeMap = {};
  (fees || []).forEach(f => { (feeMap[f.payment_method_id] = feeMap[f.payment_method_id] || []).push(f); });

  (paymentMethods || []).forEach(pm => {
    // Render list item for Payment Methods tab
    if (ul) {
      const li = document.createElement('li');
      li.className = 'flex flex-col py-1 border-b border-slate-100 dark:border-slate-700';
      li.innerHTML = `
        <div class="view flex items-center justify-between">
          <span class="item-name">${pm.name}</span>
          <div class="flex items-center gap-2">
            <button class="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 btn-edit" data-entity="payment_methods" data-id="${pm.id}">✏️</button>
            <button class="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 btn-del" data-entity="payment_methods" data-id="${pm.id}">🗑️</button>
          </div>
        </div>
        <div class="edit hidden mt-2 flex items-center gap-2">
          <input type="text" class="input flex-1 edit-input" value="${pm.name}" />
          <button class="btn-primary btn-save" data-entity="payment_methods" data-id="${pm.id}">✓</button>
          <button class="btn-secondary btn-cancel">×</button>
        </div>`;
      ul.appendChild(li);
    }

    // Render card for Fees tab
    if (cardsWrap) {
      const card = document.createElement('div');
      card.className = 'card space-y-3';
      const feesForPm = feeMap[pm.id] || [];
      card.innerHTML = `
        <div class="flex items-center justify-between">
          <h4 class="text-sm font-semibold">${pm.name}</h4>
        </div>
        <form class="fee-form grid grid-cols-1 md:grid-cols-3 gap-2" data-pm="${pm.id}">
          <input type="text" name="name" class="input md:col-span-2" placeholder="Descrição da Taxa" required />
          <input type="number" name="percent" class="input" step="0.01" min="0" placeholder="Taxa (%)" required />
          <button type="submit" class="btn-primary md:col-span-3">Adicionar Taxa</button>
        </form>
        <ul class="space-y-1 fee-list" data-pm="${pm.id}"></ul>`;
      cardsWrap.appendChild(card);
      const list = card.querySelector('.fee-list');
      feesForPm.forEach(f => {
        const li = document.createElement('li');
        li.className = 'flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-700';
        li.innerHTML = `
          <span>${f.name} — ${(parseFloat(f.percent)*100).toFixed(2)}%</span>
          <button class="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 btn-fee-del" data-id="${f.id}" data-pm_id="${pm.id}">🗑️</button>`;
        list.appendChild(li);
      });
    }
  });
}

// =====================
// Reports screen
// =====================
function initReports() {
  const accSel = qs('#rep-accounts');
  const ccSel = qs('#rep-costcenters');
  const accounts = state.catalogs?.accounts || [];
  const ccs = state.catalogs?.cost_centers || [];
  if (accSel) accSel.innerHTML = accounts.map(a=> `<option value="${a.id}">${a.name}</option>`).join('');
  if (ccSel) ccSel.innerHTML = ccs.map(c=> `<option value="${c.id}">${c.name}</option>`).join('');

  const periodSel = qs('#rep-period');
  const customWrap = qs('#rep-period-custom');
  if (periodSel && customWrap && !periodSel._bound) {
    periodSel._bound = true;
    periodSel.addEventListener('change', () => {
      customWrap.classList.toggle('hidden', periodSel.value !== 'custom');
    });
  }
  const btnApply = qs('#rep-apply');
  const btnClear = qs('#rep-clear');
  if (btnApply && !btnApply._bound) { btnApply._bound = true; btnApply.addEventListener('click', applyReportFilters); }
  if (btnClear && !btnClear._bound) {
    btnClear._bound = true;
    btnClear.addEventListener('click', () => {
      qs('#rep-type').value = 'dre';
      qs('#rep-status-realizado').checked = true;
      qs('#rep-status-projetado').checked = true;
      qs('#rep-period').value = 'este_mes';
      customWrap.classList.add('hidden');
      qs('#rep-date-from').value = '';
      qs('#rep-date-to').value = '';
      qsa('#rep-accounts option').forEach(o=> o.selected = false);
      qsa('#rep-costcenters option').forEach(o=> o.selected = false);
      showReportEmpty();
    });
  }

  const btnPdf = qs('#rep-pdf');
  const btnExcel = qs('#rep-excel');
  if (btnPdf && !btnPdf._bound) { btnPdf._bound = true; btnPdf.addEventListener('click', exportReportPDF); }
  if (btnExcel && !btnExcel._bound) { btnExcel._bound = true; btnExcel.addEventListener('click', exportReportCSV); }

  showReportEmpty();
}

// =====================
// Profile screen
// =====================
async function initProfile() {
  // Carrega dados atuais
  const prof = await apiProfile('get');
  const u = prof.user || state.user || {};
  const nameEl = qs('#profile-name');
  const emailEl = qs('#profile-email');
  const avatarEl = qs('#profile-avatar');
  if (nameEl) nameEl.value = u.name || '';
  if (emailEl) emailEl.value = u.email || '';
  if (avatarEl) avatarEl.src = u.avatar_url || '';

  // Basic form
  const formBasic = qs('#form-profile-basic');
  if (formBasic && !formBasic._bound) {
    formBasic._bound = true;
    formBasic.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = { name: nameEl.value.trim(), email: emailEl.value.trim().toLowerCase() };
      const res = await apiProfile('update-basic', data);
      if (!res.success) { alert(res.message || 'Falha ao salvar perfil'); return; }
      state.user = { ...(state.user || {}), name: data.name, email: data.email };
      // Atualiza header (sem avatar)
      const btn = qs('#profile-btn');
      if (btn) {
        btn.classList.remove('avatar-btn');
        btn.style.backgroundImage = '';
        btn.textContent = (state.user?.name?.[0] || state.user?.email?.[0] || 'U').toUpperCase();
      }
      alert('Perfil atualizado com sucesso');
    });
  }

  // Avatar upload
  const formAvatar = qs('#form-profile-avatar');
  const fileInput = qs('#profile-avatar-file');
  const btnSelect = qs('#btn-avatar-select');
  if (btnSelect && !btnSelect._bound) {
    btnSelect._bound = true;
    btnSelect.addEventListener('click', () => fileInput && fileInput.click());
  }
  if (formAvatar && !formAvatar._bound) {
    formAvatar._bound = true;
    formAvatar.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!fileInput || !fileInput.files || !fileInput.files[0]) { alert('Selecione uma imagem'); return; }
      const fd = new FormData(); fd.append('avatar', fileInput.files[0]);
      const res = await apiProfile('upload-avatar', fd);
      if (!res.success) { alert(res.message || 'Falha ao enviar avatar'); return; }
      if (avatarEl) avatarEl.src = res.avatar_url || '';
      // Atualiza header com avatar centrado
      state.user = { ...(state.user || {}), avatar_url: res.avatar_url };
      const btn = qs('#profile-btn');
      if (btn) {
        btn.classList.add('avatar-btn');
        btn.style.backgroundImage = `url(${res.avatar_url})`;
        btn.textContent = '';
      }
      alert('Foto atualizada com sucesso');
    });
  }

  // Alterar senha
  const formPwd = qs('#form-profile-password');
  const pwdCurrent = qs('#profile-pwd-current');
  const pwdNew = qs('#profile-pwd-new');
  const pwdConfirm = qs('#profile-pwd-confirm');
  if (formPwd && !formPwd._bound) {
    formPwd._bound = true;
    formPwd.addEventListener('submit', async (e) => {
      e.preventDefault();
      const n = pwdNew.value || ''; const c = pwdConfirm.value || '';
      if (n.length < 6) { alert('A nova senha deve ter pelo menos 6 caracteres'); return; }
      if (n !== c) { alert('Confirmação de senha não confere'); return; }
      const res = await apiProfile('change-password', { current_password: pwdCurrent.value || '', new_password: n });
      if (!res.success) { alert(res.message || 'Falha ao alterar senha'); return; }
      // Limpa campos
      pwdCurrent.value = ''; pwdNew.value = ''; pwdConfirm.value = '';
      alert('Senha alterada com sucesso');
    });
  }

  // Excluir conta
  const formDel = qs('#form-profile-delete');
  const delInput = qs('#delete-confirm');
  const btnDel = qs('#btn-delete-account');
  if (delInput && !delInput._bound) {
    delInput._bound = true;
    delInput.addEventListener('input', () => {
      if (btnDel) btnDel.disabled = (delInput.value.trim().toUpperCase() !== 'DELETAR');
    });
  }
  if (formDel && !formDel._bound) {
    formDel._bound = true;
    formDel.addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await apiProfile('delete-account', { confirm: delInput.value || '' });
      if (!res.success) { alert(res.message || 'Falha ao excluir conta'); return; }
      alert('Conta excluída. Até breve!');
      // Redireciona para login
      show('#auth-view');
    });
  }
}

function showReportEmpty() {
  const empty = qs('#rep-output-empty');
  const out = qs('#rep-output');
  if (empty) empty.classList.remove('hidden');
  if (out) out.classList.add('hidden');
}

function showReportOutput() {
  const empty = qs('#rep-output-empty');
  const out = qs('#rep-output');
  if (empty) empty.classList.add('hidden');
  if (out) out.classList.remove('hidden');
}

function getSelectedValues(selectEl) {
  const vals = [];
  if (!selectEl) return vals;
  for (const opt of selectEl.options) { if (opt.selected) vals.push(opt.value); }
  return vals;
}

function parseDateBR(str) {
  if (!str) return null;
  const m = String(str).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function formatDateBR(yyyy_mm_dd) {
  if (!yyyy_mm_dd) return '';
  const [y,m,d] = String(yyyy_mm_dd).split('-');
  return `${d}/${m}/${y}`;
}

function labelPeriod(period, from, to) {
  const now = new Date();
  if (period === 'este_mes') return `Este Mês (${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()})`;
  if (period === 'mes_passado') {
    const dt = new Date(now.getFullYear(), now.getMonth()-1, 1);
    return `Mês Passado (${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()})`;
  }
  if (period === 'este_ano') return `Este Ano (${now.getFullYear()})`;
  if (period === 'ultimos_90') return 'Últimos 90 dias';
  if (period === 'custom') return `Personalizado (${formatDateBR(from)} a ${formatDateBR(to)})`;
  return 'Período';
}

async function applyReportFilters() {
  const type = qs('#rep-type').value;
  const statusRealizado = qs('#rep-status-realizado').checked;
  const statusProjetado = qs('#rep-status-projetado').checked;
  const statusParam = (!statusRealizado && !statusProjetado) ? 'todas' : (!statusRealizado ? 'projetado' : (!statusProjetado ? 'realizado' : 'todas'));
  const period = qs('#rep-period').value;
  const fromStr = parseDateBR(qs('#rep-date-from').value);
  const toStr = parseDateBR(qs('#rep-date-to').value);
  const accIds = getSelectedValues(qs('#rep-accounts'));
  const ccIds = getSelectedValues(qs('#rep-costcenters'));

  const params = { company_id: state.currentCompanyId, status: statusParam };
  const now = new Date();
  if (period === 'este_mes') {
    params.year = String(now.getFullYear());
    params.month = String(now.getMonth()+1).padStart(2,'0');
  } else if (period === 'mes_passado') {
    const dt = new Date(now.getFullYear(), now.getMonth()-1, 1);
    params.year = String(dt.getFullYear());
    params.month = String(dt.getMonth()+1).padStart(2,'0');
  } else if (period === 'este_ano') {
    params.year = String(now.getFullYear());
    params.month = 'todos';
  }

  const res = await apiTransactions('list', params);
  let items = res.items || [];
  if (accIds.length) items = items.filter(t => accIds.includes(t.account_id));
  if (ccIds.length) items = items.filter(t => ccIds.includes(t.cost_center_id));
  if (period === 'ultimos_90') {
    const end = new Date();
    const start = new Date(end.getTime() - 89*24*60*60*1000);
    items = items.filter(t => { const dt = new Date(t.date); return dt >= start && dt <= end; });
  } else if (period === 'custom' && fromStr && toStr) {
    const start = new Date(fromStr);
    const end = new Date(toStr);
    items = items.filter(t => { const dt = new Date(t.date); return dt >= start && dt <= end; });
  }

  const periodLabel = labelPeriod(period, fromStr, toStr);
  const agg = aggregateReport(items, type);
  state.reports = { type, period, periodLabel, rows: agg.rows, summary: agg.summary };
  renderReport(state.reports);
  showReportOutput();
}

function aggregateReport(items, type) {
  const rows = [];
  const summary = { totalIncome: 0, totalExpense: 0 };
  const netOf = (t) => t.type==='income' ? (t.amount - (t.fee_percent ? t.amount*t.fee_percent : 0)) : -t.amount;
  const catMap = Object.fromEntries((state.catalogs?.categories||[]).map(c=> [c.id, c.name]));

  if (type === 'dre') {
    const byCat = {};
    for (const t of items) {
      const key = `${t.type}:${t.category_id||'—'}`;
      byCat[key] = (byCat[key] || 0) + netOf(t);
      if (t.type==='income') summary.totalIncome += netOf(t); else summary.totalExpense += -netOf(t);
    }
    for (const [key, val] of Object.entries(byCat)) {
      const [typ, cat] = key.split(':');
      rows.push({ label: catMap[cat] || '—', type: typ, income: typ==='income'?Math.abs(val):0, expense: typ==='expense'?Math.abs(val):0, net: val });
    }
    rows.sort((a,b)=> Math.abs(b.net) - Math.abs(a.net));
  } else if (type === 'cash-daily') {
    const byDay = {};
    for (const t of items) {
      const day = t.date;
      const amt = netOf(t);
      const cur = byDay[day] || { income:0, expense:0 };
      if (t.type==='income') cur.income += Math.abs(amt); else cur.expense += Math.abs(amt);
      byDay[day] = cur;
    }
    const days = Object.keys(byDay).sort((a,b)=> a.localeCompare(b));
    let running = 0;
    for (const d of days) {
      const inc = byDay[d].income, exp = byDay[d].expense;
      running += inc - exp; summary.totalIncome += inc; summary.totalExpense += exp;
      rows.push({ label: formatDateBR(d), type: 'day', income: inc, expense: exp, net: inc-exp, running });
    }
  } else if (type === 'cash-monthly') {
    const byMonth = {};
    for (const t of items) {
      const m = (t.date||'').slice(0,7);
      const amt = netOf(t);
      const cur = byMonth[m] || { income:0, expense:0 };
      if (t.type==='income') cur.income += Math.abs(amt); else cur.expense += Math.abs(amt);
      byMonth[m] = cur;
    }
    const months = Object.keys(byMonth).sort((a,b)=> a.localeCompare(b));
    let running = 0;
    for (const m of months) {
      const inc = byMonth[m].income, exp = byMonth[m].expense;
      running += inc - exp; summary.totalIncome += inc; summary.totalExpense += exp;
      const [y,mm] = m.split('-');
      rows.push({ label: `${mm}/${y}`, type: 'month', income: inc, expense: exp, net: inc-exp, running });
    }
  }
  return { rows, summary };
}

function renderReport(rep) {
  qs('#rep-title').textContent = rep.type === 'dre'
    ? 'DRE — Demonstrativo de Resultados'
    : (rep.type === 'cash-daily' ? 'Fluxo de Caixa Diário' : 'Fluxo de Caixa Mensal');
  qs('#rep-period-label').textContent = rep.periodLabel || '';
  const tbl = qs('#rep-table');
  const head = `<thead><tr>
    <th class="text-left py-2 pr-3">${rep.type==='dre'?'Categoria':'Período'}</th>
    <th class="text-right py-2 pr-3">Receitas</th>
    <th class="text-right py-2 pr-3">Despesas</th>
    <th class="text-right py-2 pr-3">Saldo</th>
    ${rep.type!=='dre'?'<th class="text-right py-2 pr-3">Acumulado</th>':''}
  </tr></thead>`;
  const body = `<tbody>${rep.rows.map(r => {
    const netClass = r.net>=0 ? 'text-income' : 'text-expense';
    return `<tr>
      <td class="py-2 pr-3">${r.label}</td>
      <td class="py-2 pr-3 text-right">${formatBRL(r.income||0)}</td>
      <td class="py-2 pr-3 text-right">${formatBRL(r.expense||0)}</td>
      <td class="py-2 pr-3 text-right ${netClass}">${formatBRL(r.net||0)}</td>
      ${rep.type!=='dre'?`<td class="py-2 pr-3 text-right">${formatBRL(r.running||0)}</td>`:''}
    </tr>`;
  }).join('')}</tbody>`;
  const foot = `<tfoot><tr>
    <td class="py-2 pr-3 font-semibold">Totais</td>
    <td class="py-2 pr-3 text-right font-semibold">${formatBRL(rep.summary.totalIncome||0)}</td>
    <td class="py-2 pr-3 text-right font-semibold">${formatBRL(rep.summary.totalExpense||0)}</td>
    <td class="py-2 pr-3 text-right font-semibold">${formatBRL((rep.summary.totalIncome||0)-(rep.summary.totalExpense||0))}</td>
    ${rep.type!=='dre'?'<td></td>':''}
  </tr></tfoot>`;
  tbl.innerHTML = head + body + foot;
}

function exportReportCSV() {
  const rep = state.reports; if (!rep) return;
  const header = [rep.type==='dre'?'Categoria':'Período','Receitas','Despesas','Saldo'].concat(rep.type!=='dre'?['Acumulado']:[]);
  const rows = rep.rows.map(r => [r.label, r.income||0, r.expense||0, r.net||0].concat(rep.type!=='dre'?[r.running||0]:[]));
  const csv = [header].concat(rows).map(cols => cols.map(v => typeof v==='number'?String(v).replace('.',','):('"'+String(v).replace('"','""')+'"')).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `relatorio_${rep.type}.csv`; a.click(); URL.revokeObjectURL(url);
}

function exportReportPDF() {
  const el = qs('#rep-output'); if (!el) return;
  const w = window.open('', '_blank');
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(s=> s.outerHTML).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8">${styles}<title>Relatório</title></head><body class="light">${el.outerHTML}</body></html>`);
  w.document.close(); w.focus(); setTimeout(() => { w.print(); w.close(); }, 300);
}

function bindCatalogForms() {
  // Prevent duplicate bindings when navigating to Catalogs multiple times
  if (state.catalogFormsBound) return;
  state.catalogFormsBound = true;
  const forms = {
    categories: qs('#form-category'),
    subcategories: qs('#form-subcategory'),
    cost_centers: qs('#form-costcenter'),
    accounts: qs('#form-account'),
    payment_methods: qs('#form-payment'),
  };
  // Attach currency mask to account initial balance
  const initBal = forms.accounts?.querySelector('input[name="initial_balance"]');
  if (initBal) attachCurrencyMask(initBal);
  if (forms.categories) forms.categories.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(forms.categories));
    await apiCatalogsCRUD('categories','create', data);
    await loadCatalogs();
    populateCatalogDropdowns();
    refreshCatalogLists();
    forms.categories.reset();
  });
  if (forms.subcategories) forms.subcategories.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(forms.subcategories));
    await apiCatalogsCRUD('subcategories','create', data);
    await loadCatalogs();
    refreshCatalogLists();
    forms.subcategories.reset();
  });
  if (forms.cost_centers) forms.cost_centers.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(forms.cost_centers));
    await apiCatalogsCRUD('cost_centers','create', data);
    await loadCatalogs();
    refreshCatalogLists();
    forms.cost_centers.reset();
  });
  if (forms.accounts) forms.accounts.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(forms.accounts);
    const data = Object.fromEntries(fd);
    data.initial_balance = parseBRLToFloat(data.initial_balance);
    // Always send boolean and ensure there is at least one default account.
    const userSelectedDefault = !!fd.get('is_default');
    const hasDefault = (state.catalogs?.accounts || []).some(a => a.is_default === true);
    // If no default exists yet and user did not select, make this new one default
    data.is_default = hasDefault ? userSelectedDefault : true;
    await apiCatalogsCRUD('accounts','create', data);
    await loadCatalogs();
    refreshCatalogLists();
    forms.accounts.reset();
  });
  if (forms.payment_methods) forms.payment_methods.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(forms.payment_methods));
    await apiCatalogsCRUD('payment_methods','create', data);
    await loadCatalogs();
    populateCatalogDropdowns();
    refreshCatalogLists();
    forms.payment_methods.reset();
  });
}

function bindCatalogDeletesAndEdits() {
  // Inline edit toggling
  qsa('#view-catalogs li .btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const li = btn.closest('li');
      if (!li) return;
      li.querySelector('.view')?.classList.add('hidden');
      li.querySelector('.edit')?.classList.remove('hidden');
      const balInput = li.querySelector('.edit-balance');
      if (balInput) attachCurrencyMask(balInput);
    });
  });
  qsa('#view-catalogs li .btn-cancel').forEach(btn => {
    btn.addEventListener('click', () => {
      const li = btn.closest('li');
      if (!li) return;
      li.querySelector('.edit')?.classList.add('hidden');
      li.querySelector('.view')?.classList.remove('hidden');
    });
  });
  qsa('#view-catalogs li .btn-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const entity = btn.dataset.entity;
      const id = btn.dataset.id;
      const li = btn.closest('li');
      if (!entity || !id || !li) return;
      const payload = { id };
      const nameInput = li.querySelector('.edit-input');
      if (nameInput) payload.name = nameInput.value.trim();
      if (entity === 'accounts') {
        const balInput = li.querySelector('.edit-balance');
        if (balInput) payload.initial_balance = parseBRLToFloat(balInput.value);
      }
      const res = await apiCatalogsCRUD(entity, 'update', payload);
      if (res?.success) {
        await refreshCatalogLists();
      }
    });
  });

  // Delete with transient confirm
  qsa('#view-catalogs li .btn-del').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.confirming === '1') return; // already in confirm state
      btn.dataset.original = btn.textContent;
      btn.textContent = 'Confirmar?';
      btn.dataset.confirming = '1';
      const entity = btn.dataset.entity; const id = btn.dataset.id;
      const timer = setTimeout(() => { btn.textContent = btn.dataset.original || '🗑️'; btn.dataset.confirming = '0'; }, 2500);
      const onConfirm = async () => {
        clearTimeout(timer);
        btn.removeEventListener('click', onConfirm);
        const res = await apiCatalogsCRUD(entity, 'delete', { id });
        if (res?.success) await refreshCatalogLists();
      };
      btn.addEventListener('click', onConfirm, { once: true });
    });
  });

  // Fee forms inside cards
  qsa('#view-catalogs .fee-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pmId = form.dataset.pm;
      const fd = new FormData(form);
      const name = fd.get('name');
      const percent = parseFloat(fd.get('percent') || '0');
      const res = await apiCatalogsCRUD('fees', 'create', { payment_method_id: pmId, name, percent: percent / 100 });
      if (res?.success) {
        await refreshCatalogLists();
        form.reset();
      }
    });
  });

  // Fee deletes
  qsa('#view-catalogs .btn-fee-del').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.confirming === '1') return;
      btn.dataset.original = btn.textContent;
      btn.textContent = 'Confirmar?';
      btn.dataset.confirming = '1';
      const id = btn.dataset.id; const pmId = btn.dataset.pm_id;
      const timer = setTimeout(() => { btn.textContent = btn.dataset.original || '🗑️'; btn.dataset.confirming = '0'; }, 2500);
      const onConfirm = async () => {
        clearTimeout(timer);
        btn.removeEventListener('click', onConfirm);
        const res = await apiCatalogsCRUD('fees', 'delete', { id, payment_method_id: pmId });
        if (res?.success) await refreshCatalogLists();
      };
      btn.addEventListener('click', onConfirm, { once: true });
    });
  });
}

function bindCatalogDeletes() {
  const container = qs('#view-catalogs');
  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-del');
    if (!btn) return;
    const entity = btn.dataset.entity;
    const id = btn.dataset.id;
    const payload = { id };
    if (entity === 'subcategories') payload.category_id = btn.dataset.category_id;
    if (entity === 'fees') payload.payment_method_id = btn.dataset.payment_method_id;
    await apiCatalogsCRUD(entity,'delete', payload);
    await loadCatalogs();
    refreshCatalogLists();
  });
}

// Toggle account default via star button using event delegation
function bindCatalogDefaultToggle() {
  if (state.catalogDefaultBound) return;
  state.catalogDefaultBound = true;
  const container = qs('#view-catalogs');
  if (!container) return;
  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-default');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id) return;
    // Optimistic UI: immediately swap stars to reflect new default
    const all = qsa('#view-catalogs li .btn-default');
    const prevBtn = all.find(b => b.textContent === '⭐');
    all.forEach(b => { b.textContent = '☆'; });
    btn.textContent = '⭐';
    // Disable during request to avoid rapid double toggles
    all.forEach(b => b.setAttribute('disabled','true'));
    const res = await apiCatalogsCRUD('accounts', 'update', { id, is_default: true });
    all.forEach(b => b.removeAttribute('disabled'));
    if (!res?.success) {
      // Revert UI on failure
      btn.textContent = '☆';
      if (prevBtn) prevBtn.textContent = '⭐';
      alert(res?.message || 'Erro ao definir conta padrão');
      return;
    }
    // Refresh lists to ensure single default from backend and sync state
    await loadCatalogs();
    await refreshCatalogLists();
  });
}