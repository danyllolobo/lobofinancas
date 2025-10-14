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
};

const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));

function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
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
  ['#auth-view', '#onboarding-view', '#app-view'].forEach((id) => qs(id).classList.add('hidden'));
  qs(viewId).classList.remove('hidden');
}

function setRoute(route) {
  state.route = route;
  qsa('.nav-link').forEach((a) => a.classList.remove('active'));
  const link = document.querySelector(`a[href="#${route}"]`);
  if (link) link.classList.add('active');
  qs('#page-title').textContent = route.charAt(0).toUpperCase() + route.slice(1);
  ['dashboard','transactions','reports','accounts','catalogs'].forEach((r) => {
    qs(`#view-${r}`).classList.toggle('hidden', r !== route);
  });
  if (route === 'dashboard') {
    refreshDashboard();
  }
  if (route === 'transactions') {
    initTransactions();
  }
  if (route === 'accounts') {
    initAccounts();
  }
  if (route === 'catalogs') {
    initCatalogs();
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
  return res.json();
}

async function apiDashboard(params) {
  if (DEV) {
    return computeClientDashboard(params);
  }
  const url = new URL('/api/transactions.php', window.location.origin);
  Object.entries(params || {}).forEach(([k,v])=> url.searchParams.set(k,v));
  const res = await fetch(url.toString());
  return res.json();
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
  const res = await fetch('/api/catalogs.php');
  return res.json();
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
  let url = new URL('/api/catalogs.php', window.location.origin);
  url.searchParams.set('entity', entity);
  const res = await fetch(url.toString(), { method, headers: { 'Content-Type': 'application/json' }, body: method==='GET' ? null : JSON.stringify(payload || {}) });
  return res.json();
}

async function apiTransactions(action, payloadOrParams) {
  if (DEV) {
    if (action === 'list') {
      const { company_id, status, year, month, cost_center } = payloadOrParams || {};
      const items = state.transactions.filter(t => (
        (!company_id || t.company_id === company_id) &&
        (status !== 'realizado' || t.status === true) &&
        (!cost_center || cost_center === 'todos' || t.cost_center_id === cost_center) &&
        (!year || (month === 'todos' ? t.date.startsWith(String(year)) : t.date.startsWith(`${year}-${month}`)))
      ));
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
    Object.entries(payloadOrParams || {}).forEach(([k,v])=> url.searchParams.set(k,v));
    const res = await fetch(url.toString());
    return res.json();
  }
  if (action === 'create') {
  const res = await fetch('/api/transactions.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadOrParams)
    });
    return res.json();
  }
  if (action === 'update') {
  const res = await fetch('/api/transactions.php', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadOrParams)
    });
    return res.json();
  }
  if (action === 'delete') {
    const id = payloadOrParams?.id;
  const res = await fetch(`/api/transactions.php?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    return res.json();
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
  const toArr = (m) => ({ labels: Object.keys(m), values: Object.values(m) });
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
    state.currentCompanyId = state.companies[0].id;
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
  setRoute('dashboard');
}

function populateCompanySelect() {
  const sel = qs('#company-select');
  sel.innerHTML = state.companies.map(c => `<option value="${c.id}" ${c.id===state.currentCompanyId?'selected':''}>${c.name}</option>`).join('');
  sel.addEventListener('change', async () => {
    state.currentCompanyId = sel.value;
    await refreshDashboard();
  });
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
    accSel.innerHTML = (state.catalogs?.accounts||[]).map(a=> `<option value="${a.id}">${a.name}</option>`).join('');
  }
}

function populateModalFromCatalogs() {
  const accSel = qs('#tx-account');
  accSel.innerHTML = (state.catalogs?.accounts||[]).map(a=> `<option value="${a.id}">${a.name}</option>`).join('');
  const pmSel = qs('#tx-payment');
  pmSel.innerHTML = (state.catalogs?.payment_methods||[]).map(p=> `<option value="${p.id}">${p.name}</option>`).join('');
  const ccSel = qs('#tx-cost-center');
  ccSel.innerHTML = (state.catalogs?.cost_centers||[]).map(c=> `<option value="${c.id}">${c.name}</option>`).join('');
}

function initHeader() {
  qs('#theme-toggle').addEventListener('click', toggleTheme);
  qs('#profile-btn').textContent = (state.user?.name?.[0] || state.user?.email?.[0] || 'U').toUpperCase();
  qs('#profile-btn').addEventListener('click', () => {
    qs('#profile-menu').classList.toggle('hidden');
  });
  qs('#logout').addEventListener('click', async () => {
    await apiAuth('logout', {});
    state.user = null;
    show('#auth-view');
  });
  const sidebar = qs('#sidebar');
  const overlay = qs('#sidebar-overlay');
  qs('#btn-menu').addEventListener('click', () => {
    sidebar.classList.add('open');
    overlay.classList.remove('hidden');
  });
  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.add('hidden');
  });
  qsa('.nav-link').forEach((a) => a.addEventListener('click', (e) => {
    const hash = a.getAttribute('href').replace('#', '');
    setRoute(hash);
    // Fechar menu em mobile
    if (overlay && !overlay.classList.contains('hidden')) {
      sidebar.classList.remove('open');
      overlay.classList.add('hidden');
    }
  }));
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
  const data = DEV ? await apiDashboard(params) : await apiTransactions('list', params);
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
  pieExpense = new Chart(ectx, {
    type: 'doughnut',
    data: {
      labels: categories.expense.labels,
      datasets: [{ data: categories.expense.values, backgroundColor: ['#e74c3c','#c0392b','#ff7675','#d63031'] }]
    },
    options: { plugins: { legend: { labels: { color: document.documentElement.classList.contains('dark') ? '#e2e8f0' : '#334155' } } } }
  });
  pieIncome = new Chart(ictx, {
    type: 'doughnut',
    data: {
      labels: categories.income.labels,
      datasets: [{ data: categories.income.values, backgroundColor: ['#2ecc71','#27ae60','#55efc4','#00b894'] }]
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
    yearSel.innerHTML = years.map(y=>`<option value="${y}">${y}</option>`).join('');
    monthSel.innerHTML = ['Todos','01','02','03','04','05','06','07','08','09','10','11','12'].map((m,i)=>`<option value="${i===0?'todos':m}">${i===0?'Todos':m}</option>`).join('');
  }
  // CC
  populateFiltersFromCatalogs();
  // Listeners
  ['tx-filter-status','tx-filter-cc','tx-filter-category','tx-filter-year','tx-filter-month'].forEach(id => {
    const el = qs('#'+id); if (el) el.addEventListener('change', refreshTransactions);
  });
  // Import
  const btnImport = qs('#btn-import');
  if (btnImport) btnImport.addEventListener('click', () => qs('#import-modal').classList.remove('hidden'));
  bindImportModal();
  // Modal já está ligado no initDashboard
  refreshTransactions();
}

async function refreshTransactions() {
  const params = {
    company_id: state.currentCompanyId,
    status: ['income','expense'].includes(qs('#tx-filter-status').value) ? 'todas' : qs('#tx-filter-status').value,
    type: ['income','expense'].includes(qs('#tx-filter-status').value) ? qs('#tx-filter-status').value : null,
    cost_center: qs('#tx-filter-cc').value,
    category_id: qs('#tx-filter-category').value,
    year: qs('#tx-filter-year').value,
    month: qs('#tx-filter-month').value,
  };
  const data = await apiTransactions('list', params);
  state.transactions = data.items || [];
  renderTxTable(state.transactions);
}

function renderTxTable(items) {
  const tbody = qs('#tx-table-body');
  const cats = state.catalogs?.categories || [];
  const catName = (id) => (cats.find(c=> c.id===id)?.name || '-');
  tbody.innerHTML = (items||[]).map(t => `
    <tr class="border-b border-slate-200 dark:border-slate-700">
      <td class="py-2 pr-3"><input type="checkbox" class="tx-select" data-id="${t.id}" /></td>
      <td class="py-2 pr-3">${t.date}</td>
      <td class="py-2 pr-3">${t.description}</td>
      <td class="py-2 pr-3">${catName(t.category_id)}</td>
      <td class="py-2 pr-3 ${t.type==='income'?'text-income':'text-expense'}">${formatBRL(t.amount)}</td>
      <td class="py-2 pr-3"><span class="pill ${t.status ? 'pill-green' : 'pill-gray'}">${t.status?'Realizada':'Projetada'}</span></td>
      <td class="py-2 pr-3">
        <button title="${t.status?'Estornar':'Quitar'}" class="px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 mr-2 btn-toggle-tx" data-id="${t.id}">${t.status?'⟳':'✓'}</button>
        <button class="px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 mr-2 btn-edit-tx" data-id="${t.id}">✏️</button>
        <button class="px-2 py-1 rounded bg-red-100 dark:bg-red-900/40 text-red-600 btn-del-tx" data-id="${t.id}">🗑️</button>
      </td>
    </tr>
  `).join('');
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
    const tx = items.find(it => it.id === id);
    btn.addEventListener('click', () => openTxModal(tx));
  });
  qsa('.btn-toggle-tx').forEach(btn => {
    const id = btn.dataset.id;
    const tx = items.find(it => it.id === id);
    btn.addEventListener('click', async () => {
      const res = await apiTransactions('update', { id, status: !tx.status });
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
    const v = parseFloat((amountInput.value || '0').replace(/[^0-9,.-]/g,'' ).replace(',', '.')) || 0;
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
      amount: parseFloat(String(fd.get('amount')).replace(/[^0-9,.-]/g,'' ).replace(',', '.')),
      date: fd.get('date'),
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
  if (isEdit) {
    formEl.dataset.mode = 'edit';
    formEl.dataset.id = arg.id;
    qs('input[name="description"]').value = arg.description || '';
    qs('input[name="amount"]').value = String(arg.amount || '');
    qs('input[name="date"]').value = arg.date || '';
    qs('#tx-account').value = arg.account_id || '';
    qs('#tx-category').value = arg.category_id || '';
    qs('#tx-category').dispatchEvent(new Event('change'));
    if (arg.subcategory_id) { qs('#tx-subcategory').value = arg.subcategory_id; }
    qs('#tx-cost-center').value = arg.cost_center_id || '';
    qs('#tx-payment').value = arg.payment_method_id || '';
    qs('#tx-payment').dispatchEvent(new Event('change'));
    qs('#tx-fee').value = arg.fee_percent || '0';
    qs('#tx-status').checked = !!arg.status;
  } else {
    formEl.dataset.mode = 'create';
    formEl.dataset.id = '';
    formEl.reset();
    qs('#tx-type').value = type;
    const today = new Date().toISOString().slice(0,10);
    qs('input[name="date"]').value = today;
    qs('#tx-payment').dispatchEvent(new Event('change'));
  }
  qs('#tx-modal').classList.remove('hidden');
}

// Boot
function boot() {
  initTheme();
  bindAuthUI();
  bindOnboardingUI();
  if (DEV) {
    state.user = { id: 'devuser', name: 'Usuário Dev', email: 'dev@example.com' };
    state.companies = [{ id: 'cmp_dev', name: 'Empresa Dev' }];
    state.currentCompanyId = 'cmp_dev';
    enterApp();
  } else {
    show('#auth-view');
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
      const lines = text.split(/\r?\n/).filter(l=> l.trim().length>0);
      validItems = []; const errors = [];
      const header = lines[0].split(',').map(h=> h.trim());
      const required = ['Data','Tipo','Descricao','Valor','Categoria'];
      const hasRequired = required.every(r => header.includes(r));
      if (!hasRequired) {
        errors.push(`Cabeçalho inválido. Esperado pelo menos: ${required.join(', ')}`);
      }
      for (let i=1;i<lines.length;i++) {
        const raw = lines[i]; if (!raw.trim()) continue;
        const cols = raw.split(',');
        const get = (name) => cols[header.indexOf(name)] || '';
        const rowErrors = [];
        const date = get('Data');
        const typeStr = get('Tipo');
        const description = get('Descricao');
        const amountStr = get('Valor');
        const categoryName = get('Categoria');
        const ccName = get('CentroDeCusto');
        const accountName = get('Conta');
        const pmName = get('FormaDePagamento');
        const feeDesc = get('DescricaoTaxa');
        const statusStr = get('Status');
        const type = typeStr.toLowerCase().includes('rece') ? 'income' : 'expense';
        const amount = parseFloat(String(amountStr).replace(/[^0-9,.-]/g,'' ).replace(',', '.'));
        if (!/\d{4}-\d{2}-\d{2}/.test(date)) rowErrors.push('Data inválida (YYYY-MM-DD)');
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
          errors.push(`Linha ${i+1}: ${rowErrors.join('; ')}`);
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
      saveBtn.disabled = validItems.length === 0;
    };
    reader.readAsText(file);
  });
  saveBtn && saveBtn.addEventListener('click', async () => {
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
  ['acc-select','acc-year','acc-month'].forEach(id => qs('#'+id).addEventListener('change', refreshAccounts));
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
  let initial = 0;
  if (month !== 'todos') {
    const periodStart = `${year}-${month}-01`;
    initial = all
      .filter(t=> t.date < periodStart)
      .reduce((sum,t)=> sum + (t.type==='income' ? (t.amount - (t.fee_percent ? t.amount*t.fee_percent : 0)) : -t.amount), 0);
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
  renderAccountStatement(monthItems, initial);
}

function renderAccountStatement(items, opening) {
  const tbody = qs('#acc-table-body');
  let running = opening;
  const catMap = Object.fromEntries((state.catalogs?.categories||[]).map(c=> [c.id, c.name]));
  tbody.innerHTML = items.map(t=> {
    const fee = (t.fee_percent ? t.amount*t.fee_percent : 0);
    const net = t.type==='income' ? (t.amount - fee) : -t.amount;
    running += net;
    const typeLabel = t.type==='income' ? 'Receita' : 'Despesa';
    const valClass = net >= 0 ? 'text-income' : 'text-expense';
    return `
      <tr class="border-b border-slate-100 dark:border-slate-700">
        <td class="py-2 pr-3">${t.date}</td>
        <td class="py-2 pr-3">${t.description}</td>
        <td class="py-2 pr-3">${catMap[t.category_id]||'—'}</td>
        <td class="py-2 pr-3">${typeLabel}</td>
        <td class="py-2 pr-3 ${valClass}">${formatBRL(net)}</td>
        <td class="py-2 pr-3">${formatBRL(running)}</td>
      </tr>`;
  }).join('');
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
    bindCatalogDeletes();
  });
}

function populateCatalogDropdowns() {
  const cats = state.catalogs?.categories || [];
  const subcatSel = qs('#subcat-category');
  if (subcatSel) subcatSel.innerHTML = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  const pms = state.catalogs?.payment_methods || [];
  const feePaymentSel = qs('#fee-payment');
  if (feePaymentSel) feePaymentSel.innerHTML = pms.map(pm => `<option value="${pm.id}">${pm.name}</option>`).join('');
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
  renderCatalogTable('categories', cats.items || []);
  renderCatalogTable('subcategories', subs.items || []);
  renderCatalogTable('cost_centers', ccs.items || []);
  renderCatalogTable('accounts', accs.items || []);
  renderCatalogTable('payment_methods', pms.items || []);
  renderCatalogTable('fees', fees.items || []);
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

function bindCatalogForms() {
  const forms = {
    categories: qs('#form-category'),
    subcategories: qs('#form-subcategory'),
    cost_centers: qs('#form-costcenter'),
    accounts: qs('#form-account'),
    payment_methods: qs('#form-payment'),
    fees: qs('#form-fee'),
  };
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
    const data = Object.fromEntries(new FormData(forms.accounts));
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
  if (forms.fees) forms.fees.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(forms.fees));
    await apiCatalogsCRUD('fees','create', data);
    await loadCatalogs();
    refreshCatalogLists();
    forms.fees.reset();
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