<?php
// Simple SPA shell served by PHP
?>
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>Lobo Finance</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = {
        theme: {
          extend: {
            colors: {
              accent: '#4a69bd',
              income: '#2ecc71',
              expense: '#e74c3c',
              profit: '#8e44ad',
              lightbg: '#f5f7fa',
              darkbg: '#1a202c',
              darkcard: '#2d3748',
              darktext: '#e2e8f0',
            }
          }
        }
      }
    </script>
    <link rel="stylesheet" href="/styles.css" />
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  </head>
  <body class="min-h-screen bg-lightbg text-slate-800 dark:bg-darkbg dark:text-darktext transition-colors duration-300">
    <!-- Auth View -->
    <section id="auth-view" class="flex items-center justify-center min-h-screen p-4">
      <div class="absolute inset-0 -z-10 gradient-bg"></div>
      <div class="w-full max-w-md bg-white/90 dark:bg-darkcard rounded-2xl shadow-lg p-6">
        <div class="text-center mb-6">
          <h1 class="font-['Playfair Display'] text-3xl font-bold">Lobo Finance</h1>
          <p class="text-sm text-slate-500 dark:text-slate-300 mt-1">Gestão Financeira Pessoal/Empresarial</p>
        </div>
        <div class="flex gap-2 mb-4">
          <button id="btn-login" class="flex-1 py-2 rounded-lg bg-accent text-white">Login</button>
          <button id="btn-register" class="flex-1 py-2 rounded-lg bg-slate-200 dark:bg-slate-700">Cadastro</button>
        </div>
        <!-- Login Form -->
        <form id="form-login" class="space-y-3">
          <input type="email" name="email" placeholder="Email" class="w-full input" required />
          <input type="password" name="password" placeholder="Senha" class="w-full input" required />
          <button type="submit" class="w-full btn-primary">Entrar</button>
          <button type="button" id="btn-google" class="w-full btn-secondary">Entrar com Google</button>
        </form>
        <!-- Register Form -->
        <form id="form-register" class="space-y-3 hidden">
          <input type="text" name="name" placeholder="Nome" class="w-full input" required />
          <input type="email" name="email" placeholder="Email" class="w-full input" required />
          <input type="password" name="password" placeholder="Senha" class="w-full input" required />
          <button type="submit" class="w-full btn-primary">Criar conta</button>
        </form>
      </div>
    </section>

    <!-- Onboarding View -->
    <section id="onboarding-view" class="hidden min-h-screen p-6">
      <div class="max-w-xl mx-auto bg-white dark:bg-darkcard rounded-2xl shadow-lg p-6 animate-fade-in">
        <h2 class="text-2xl font-semibold mb-2">Bem-vindo, <span id="onboarding-name"></span> 👋</h2>
        <p class="text-slate-600 dark:text-slate-300 mb-4">Crie sua primeira Empresa/Cofre financeiro para começar.</p>
        <form id="form-company" class="space-y-3">
          <input type="text" name="name" placeholder="Nome da Empresa" class="w-full input" required />
          <button type="submit" class="btn-primary">Criar Empresa</button>
        </form>
      </div>
    </section>

    <!-- App View -->
    <section id="app-view" class="hidden min-h-screen">
      <div class="flex min-h-screen">
        <!-- Sidebar -->
        <aside id="sidebar" class="sidebar hidden md:block">
          <div class="p-4">
            <div class="font-['Playfair Display'] text-xl">Lobo Finance</div>
          </div>
          <nav class="px-2 space-y-1">
            <a href="#dashboard" class="nav-link active">Dashboard</a>
            <a href="#transactions" class="nav-link">Transações</a>
            <a href="#reports" class="nav-link">Relatórios</a>
            <a href="#accounts" class="nav-link">Contas</a>
            <a href="#catalogs" class="nav-link">Cadastros</a>
          </nav>
        </aside>
        <div id="sidebar-overlay" class="sidebar-overlay hidden"></div>

        <!-- Main -->
        <main class="flex-1">
          <!-- Header -->
          <header class="sticky top-0 z-10 bg-white/80 dark:bg-darkcard/80 backdrop-blur border-b border-slate-200 dark:border-slate-700">
            <div class="flex items-center justify-between px-4 py-3">
              <div class="flex items-center gap-2">
                <button id="btn-menu" class="md:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">☰</button>
                <h2 id="page-title" class="text-xl font-semibold">Dashboard</h2>
              </div>

              <div class="flex items-center gap-3">
                <select id="company-select" class="select"></select>
                <button id="theme-toggle" class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700" title="Alternar tema">🌙</button>
                <div class="relative">
                  <button id="profile-btn" class="w-8 h-8 bg-accent text-white rounded-full">U</button>
                  <div id="profile-menu" class="absolute right-0 mt-2 w-40 bg-white dark:bg-darkcard rounded-lg shadow-lg hidden">
                    <button class="menu-item" id="edit-profile">Editar Perfil</button>
                    <button class="menu-item" id="logout">Sair</button>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <!-- Content -->
          <div id="content" class="container-responsive space-y-4">
            <!-- Dashboard -->
            <section id="view-dashboard" class="space-y-4">
              <!-- Filtros -->
              <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
                <select id="filter-status" class="select">
                  <option value="realizado">Realizado</option>
                  <option value="projetado">Projetado</option>
                </select>
                <select id="filter-cc" class="select">
                  <option value="todos">Centro de Custo: Todos</option>
                </select>
                <select id="filter-year" class="select"></select>
                <select id="filter-month" class="select"></select>
              </div>

              <!-- Cards de resumo -->
              <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div class="card bg-green-50 dark:bg-green-900/30">
                  <div class="text-sm">Receitas</div>
                  <div id="card-income" class="text-2xl font-semibold text-income">R$ 0,00</div>
                </div>
                <div class="card bg-red-50 dark:bg-red-900/30">
                  <div class="text-sm">Despesas</div>
                  <div id="card-expense" class="text-2xl font-semibold text-expense">R$ 0,00</div>
                </div>
                <div class="card bg-purple-50 dark:bg-purple-900/30">
                  <div class="text-sm">Lucro/Prejuízo</div>
                  <div id="card-profit" class="text-2xl font-semibold text-profit">R$ 0,00</div>
                </div>
                <div class="card bg-blue-50 dark:bg-blue-900/30">
                  <div class="text-sm">Lucratividade</div>
                  <div id="card-margin" class="text-2xl font-semibold text-accent">0%</div>
                </div>
              </div>

              <!-- Gráfico de linha -->
              <div class="card chart-card">
                <canvas id="lineChart"></canvas>
              </div>

              <!-- Gráficos de rosca -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="card">
                  <h3 class="text-sm mb-2">Despesas por Categoria</h3>
                  <canvas id="pieExpense"></canvas>
                </div>
                <div class="card">
                  <h3 class="text-sm mb-2">Receitas por Categoria</h3>
                  <canvas id="pieIncome"></canvas>
                </div>
              </div>

              <!-- Últimas transações -->
              <div class="card">
                <h3 class="text-sm mb-2">Últimas Transações</h3>
                <ul id="last-transactions" class="space-y-2"></ul>
              </div>

              <!-- FAB -->
              <button id="fab" class="fab">+</button>
              <div id="fab-menu" class="fab-menu hidden">
                <button class="btn-primary" id="add-income">Adicionar Receita</button>
                <button class="btn-danger" id="add-expense">Adicionar Despesa</button>
              </div>
            </section>

            <!-- Outras views (placeholders) -->
            <section id="view-transactions" class="hidden space-y-4">
              <!-- Filtros -->
              <div class="grid grid-cols-1 md:grid-cols-6 gap-3 items-start">
                <select id="tx-filter-status" class="select">
                  <option value="todas">Todas</option>
                  <option value="realizado">Realizadas</option>
                  <option value="projetado">Projetadas</option>
                  <option value="income">Somente Receitas</option>
                  <option value="expense">Somente Despesas</option>
                </select>
                <select id="tx-filter-cc" class="select">
                  <option value="todos">Centro de Custo: Todos</option>
                </select>
                <select id="tx-filter-category" class="select">
                  <option value="todos">Categoria: Todas</option>
                </select>
                <select id="tx-filter-year" class="select"></select>
                <select id="tx-filter-month" class="select"></select>
                <button id="btn-import" class="btn-secondary">Importar CSV</button>
              </div>
              <!-- Ações em massa -->
              <div id="tx-massbar" class="hidden flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                <div><span id="tx-selected-count">0</span> selecionadas</div>
                <button id="tx-delete-selected" class="btn-danger">Excluir Selecionados</button>
              </div>
              <!-- Tabela -->
              <div class="card overflow-x-auto">
                <table class="min-w-full text-sm">
                  <thead>
                    <tr class="text-left border-b border-slate-200 dark:border-slate-700">
                      <th class="py-2 pr-3"><input type="checkbox" id="tx-select-all" /></th>
                      <th class="py-2 pr-3">Data</th>
                      <th class="py-2 pr-3">Descrição</th>
                      <th class="py-2 pr-3">Categoria</th>
                      <th class="py-2 pr-3">Valor</th>
                      <th class="py-2 pr-3">Status</th>
                      <th class="py-2 pr-3">Ações</th>
                    </tr>
                  </thead>
                  <tbody id="tx-table-body"></tbody>
                </table>
              </div>
            </section>
            <section id="view-reports" class="hidden">
              <div class="card">Relatórios (em breve)</div>
            </section>
            <section id="view-accounts" class="hidden">
              <div class="space-y-3">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div class="flex items-center gap-2">
                    <select id="acc-select" class="select"></select>
                    <select id="acc-year" class="select"></select>
                    <select id="acc-month" class="select"></select>
                  </div>
                  <div class="flex items-center gap-4">
                    <div class="card">
                      <span class="text-sm text-slate-500 dark:text-slate-300">Saldo Inicial</span>
                      <div id="acc-opening" class="text-lg font-semibold">R$ 0,00</div>
                    </div>
                    <div class="card">
                      <span class="text-sm text-slate-500 dark:text-slate-300">Saldo Final</span>
                      <div id="acc-closing" class="text-lg font-semibold">R$ 0,00</div>
                    </div>
                  </div>
                </div>
                <div class="card overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="text-left text-slate-500 dark:text-slate-300">
                        <th class="py-2 pr-3">Data</th>
                        <th class="py-2 pr-3">Descrição</th>
                        <th class="py-2 pr-3">Categoria</th>
                        <th class="py-2 pr-3">Tipo</th>
                        <th class="py-2 pr-3">Valor</th>
                        <th class="py-2 pr-3">Saldo</th>
                      </tr>
                    </thead>
                    <tbody id="acc-table-body"></tbody>
                  </table>
                </div>
              </div>
            </section>
            <section id="view-catalogs" class="hidden space-y-4">
              <div class="flex gap-2">
                <button class="tab btn-secondary" data-tab="categories">Categorias</button>
                <button class="tab btn-secondary" data-tab="subcategories">Subcategorias</button>
                <button class="tab btn-secondary" data-tab="cost_centers">Centros de Custo</button>
                <button class="tab btn-secondary" data-tab="accounts">Contas</button>
                <button class="tab btn-secondary" data-tab="payment_methods">Formas de Pagamento</button>
                <button class="tab btn-secondary" data-tab="fees">Taxas (Maquininha)</button>
              </div>
              <!-- Categories -->
              <div id="tab-categories" class="tab-panel card space-y-3">
                <form id="form-category" class="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input type="text" name="name" placeholder="Nome da Categoria" class="input" required />
                  <select name="type" class="select">
                    <option value="income">Receita</option>
                    <option value="expense">Despesa</option>
                  </select>
                  <button type="submit" class="btn-primary">Adicionar</button>
                </form>
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-slate-500 dark:text-slate-300">
                      <th class="py-2 pr-3">Nome</th>
                      <th class="py-2 pr-3">Tipo</th>
                      <th class="py-2 pr-3">Ações</th>
                    </tr>
                  </thead>
                  <tbody id="tbl-categories"></tbody>
                </table>
              </div>
              <!-- Subcategories -->
              <div id="tab-subcategories" class="tab-panel card space-y-3 hidden">
                <form id="form-subcategory" class="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <select name="category_id" id="subcat-category" class="select" required></select>
                  <input type="text" name="name" placeholder="Nome da Subcategoria" class="input" required />
                  <button type="submit" class="btn-primary">Adicionar</button>
                </form>
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-slate-500 dark:text-slate-300">
                      <th class="py-2 pr-3">Categoria</th>
                      <th class="py-2 pr-3">Nome</th>
                      <th class="py-2 pr-3">Ações</th>
                    </tr>
                  </thead>
                  <tbody id="tbl-subcategories"></tbody>
                </table>
              </div>
              <!-- Cost Centers -->
              <div id="tab-cost_centers" class="tab-panel card space-y-3 hidden">
                <form id="form-costcenter" class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input type="text" name="name" placeholder="Nome do Centro de Custo" class="input" required />
                  <button type="submit" class="btn-primary">Adicionar</button>
                </form>
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-slate-500 dark:text-slate-300">
                      <th class="py-2 pr-3">Nome</th>
                      <th class="py-2 pr-3">Ações</th>
                    </tr>
                  </thead>
                  <tbody id="tbl-costcenters"></tbody>
                </table>
              </div>
              <!-- Accounts -->
              <div id="tab-accounts" class="tab-panel card space-y-3 hidden">
                <form id="form-account" class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input type="text" name="name" placeholder="Nome da Conta" class="input" required />
                  <button type="submit" class="btn-primary">Adicionar</button>
                </form>
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-slate-500 dark:text-slate-300">
                      <th class="py-2 pr-3">Nome</th>
                      <th class="py-2 pr-3">Ações</th>
                    </tr>
                  </thead>
                  <tbody id="tbl-accounts"></tbody>
                </table>
              </div>
              <!-- Payment Methods -->
              <div id="tab-payment_methods" class="tab-panel card space-y-3 hidden">
                <form id="form-payment" class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input type="text" name="name" placeholder="Forma de Pagamento" class="input" required />
                  <button type="submit" class="btn-primary">Adicionar</button>
                </form>
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-slate-500 dark:text-slate-300">
                      <th class="py-2 pr-3">Nome</th>
                      <th class="py-2 pr-3">Ações</th>
                    </tr>
                  </thead>
                  <tbody id="tbl-payments"></tbody>
                </table>
              </div>
              <!-- Fees -->
              <div id="tab-fees" class="tab-panel card space-y-3 hidden">
                <form id="form-fee" class="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <select name="payment_method_id" id="fee-payment" class="select" required></select>
                  <input type="text" name="name" placeholder="Descrição da Taxa" class="input" required />
                  <input type="number" step="0.0001" name="percent" placeholder="Percentual (ex: 0.02)" class="input" required />
                  <button type="submit" class="btn-primary md:col-span-3">Adicionar</button>
                </form>
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-slate-500 dark:text-slate-300">
                      <th class="py-2 pr-3">Forma</th>
                      <th class="py-2 pr-3">Taxa</th>
                      <th class="py-2 pr-3">Percentual</th>
                      <th class="py-2 pr-3">Ações</th>
                    </tr>
                  </thead>
                  <tbody id="tbl-fees"></tbody>
                </table>
              </div>
            </section>
          </div>
        </main>
      </div>

      <!-- Modal de Transação -->
      <div id="tx-modal" class="modal hidden">
        <div class="modal-content">
          <div class="flex justify-between items-center mb-3">
            <h3 id="tx-modal-title" class="text-lg font-semibold">Adicionar Transação</h3>
            <button id="tx-close" class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">✕</button>
          </div>
          <form id="tx-form" class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input type="text" name="description" placeholder="Descrição" class="input md:col-span-2" required />
            <input type="text" name="amount" placeholder="Valor (R$)" class="input" required />
            <input type="date" name="date" class="input" required />
            <input type="hidden" name="type" id="tx-type" />
            <select name="account_id" id="tx-account" class="select md:col-span-2"></select>
            <select name="category_id" id="tx-category" class="select"></select>
            <select name="subcategory_id" id="tx-subcategory" class="select hidden"></select>
            <select name="cost_center_id" id="tx-cost-center" class="select"></select>
            <select name="payment_method_id" id="tx-payment" class="select"></select>
            <div id="tx-fee-wrapper" class="md:col-span-2 hidden">
              <label class="block text-sm mb-1">Taxas da Máquina</label>
              <select name="fee_percent" id="tx-fee" class="select"></select>
              <p id="tx-net" class="text-sm mt-2">Valor líquido: R$ 0,00</p>
            </div>
            <label class="flex items-center gap-2 md:col-span-2">
              <input type="checkbox" name="status" />
              <span>Status: Paga/Recebida</span>
            </label>
            <div class="md:col-span-2 flex justify-end gap-2 mt-2">
              <button type="button" id="tx-cancel" class="btn-secondary">Cancelar</button>
              <button type="submit" class="btn-primary">Salvar</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Modal de Importação -->
      <div id="import-modal" class="modal hidden">
        <div class="modal-content">
          <div class="flex justify-between items-center mb-3">
            <h3 class="text-lg font-semibold">Importar Transações (CSV)</h3>
            <button id="import-close" class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">✕</button>
          </div>
          <div class="space-y-3">
            <p class="text-slate-600 dark:text-slate-300">Formato esperado (cabeçalho): <code>Data,Tipo,Descricao,Valor,Categoria,CentroDeCusto,Conta,FormaDePagamento,DescricaoTaxa,Status</code></p>
            <input type="file" id="import-file" accept=".csv" class="input" />
            <div id="import-summary" class="text-sm"></div>
            <div class="card">
              <h4 class="text-sm mb-2">Erros encontrados</h4>
              <ul id="import-errors" class="text-sm space-y-1"></ul>
            </div>
            <div class="flex gap-2 justify-end">
              <button id="import-save" class="btn-primary" disabled>Salvar Transações Válidas</button>
              <button id="import-cancel" class="btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <script src="/app.js"></script>
  </body>
</html>