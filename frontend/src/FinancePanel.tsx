import { useEffect, useState } from 'react';
import { Plus, Trash2, DollarSign, ArrowUpRight, ArrowDownRight, Calendar, ChevronLeft, ChevronRight, Download, BarChart2, PieChart } from 'lucide-react';

type Api = <T>(path: string, init?: RequestInit) => Promise<T>;

type Transaction = {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  category: string;
  amount: number;
  description?: string;
  date: string;
  isRecurring: boolean;
  recurrencePattern?: string;
  source?: string;
};

type WeeklyReport = {
  period: { weekStart: string; weekEnd: string; monthStart: string; monthEnd: string };
  weekly: { income: number; expense: number; net: number; count: number; transactions: Transaction[] };
  monthly: { income: number; expense: number; net: number; count: number; byCategory: { income: Record<string, number>; expense: Record<string, number> } };
};

type MonthlyReport = {
  period: { year: number; month: number; monthStart: string; monthEnd: string };
  summary: { income: number; expense: number; net: number; count: number };
  byCategory: { income: Record<string, number>; expense: Record<string, number> };
  byDay: Array<{ date: string; income: number; expense: number }>;
  transactions: Transaction[];
};

const INCOME_CATEGORIES = [
  'SALARY', 'FREELANCE', 'INVESTMENTS', 'BUSINESS', 'GIFTS', 'REFUNDS', 'OTHER_INCOME'
];

const EXPENSE_CATEGORIES = [
  'HOUSING', 'FOOD', 'TRANSPORTATION', 'UTILITIES', 'HEALTHCARE', 'ENTERTAINMENT',
  'SHOPPING', 'EDUCATION', 'PERSONAL_CARE', 'SUBSCRIPTIONS', 'INSURANCE',
  'DEBT_PAYMENTS', 'SAVINGS', 'INVESTMENTS_EXPENSE', 'GIFTS_DONATIONS', 'OTHER_EXPENSE'
];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function getCategoryLabel(category: string) {
  return category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function CategorySelector({ value, onChange, type }: { value: string; onChange: (v: string) => void; type: 'INCOME' | 'EXPENSE' }) {
  const categories = type === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="finance-select">
      {categories.map(cat => (
        <option key={cat} value={cat}>{getCategoryLabel(cat)}</option>
      ))}
    </select>
  );
}

function TransactionForm({ onSubmit, onCancel, initialType, initialCategory, initialAmount, initialDate, initialDescription }: {
  onSubmit: (data: { type: 'INCOME' | 'EXPENSE'; category: string; amount: number; date: string; description?: string }) => void;
  onCancel: () => void;
  initialType?: 'INCOME' | 'EXPENSE';
  initialCategory?: string;
  initialAmount?: number;
  initialDate?: string;
  initialDescription?: string;
}) {
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>(initialType || 'EXPENSE');
  const [category, setCategory] = useState(initialCategory || (type === 'INCOME' ? 'SALARY' : 'FOOD'));
  const [amount, setAmount] = useState<string>(initialAmount ? String(initialAmount) : '');
  const [date, setDate] = useState(initialDate || new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState(initialDescription || '');

  useEffect(() => {
    if (!initialCategory) {
      setCategory(type === 'INCOME' ? 'SALARY' : 'FOOD');
    }
  }, [type, initialCategory]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;
    onSubmit({ type, category, amount: parseFloat(amount), date, description: description || undefined });
  };

  return (
    <form className="finance-form" onSubmit={handleSubmit}>
      <div className="finance-form-row">
        <div className="finance-form-group">
          <label className="finance-label">Type</label>
          <div className="type-toggle">
            <button type="button" className={type === 'INCOME' ? 'active' : ''} onClick={() => setType('INCOME')}>
              <ArrowUpRight size={16} /> Income
            </button>
            <button type="button" className={type === 'EXPENSE' ? 'active' : ''} onClick={() => setType('EXPENSE')}>
              <ArrowDownRight size={16} /> Expense
            </button>
          </div>
        </div>
        <div className="finance-form-group">
          <label className="finance-label">Category</label>
          <CategorySelector value={category} onChange={setCategory} type={type} />
        </div>
      </div>
      <div className="finance-form-row">
        <div className="finance-form-group">
          <label className="finance-label">Amount</label>
          <input type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="finance-input" required />
        </div>
        <div className="finance-form-group">
          <label className="finance-label">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="finance-input" required />
        </div>
      </div>
      <div className="finance-form-group full-width">
        <label className="finance-label">Description (optional)</label>
        <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="What was this for?" className="finance-input" />
      </div>
      <div className="finance-form-actions">
        <button type="button" className="finance-button secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="finance-button primary">{initialAmount ? 'Update' : 'Add'}</button>
      </div>
    </form>
  );
}

function TransactionList({ transactions, onDelete, onEdit, filterType }: { transactions: Transaction[]; onDelete: (id: string) => void; onEdit: (t: Transaction) => void; filterType?: 'INCOME' | 'EXPENSE' }) {
  const filtered = filterType ? transactions.filter(t => t.type === filterType) : transactions;
  
  if (filtered.length === 0) {
    return <div className="finance-empty">No transactions yet. Add one above.</div>;
  }

  return (
    <div className="transaction-list">
      {filtered.map(t => (
        <div key={t.id} className={`transaction-item ${t.type.toLowerCase()}`}>
          <div className="transaction-main">
            <span className="transaction-category">{getCategoryLabel(t.category)}</span>
            <span className={`transaction-amount ${t.type === 'INCOME' ? 'positive' : 'negative'}`}>
              {t.type === 'INCOME' ? '+' : '-'}{formatCurrency(t.amount)}
            </span>
          </div>
          <div className="transaction-meta">
            {t.description && <span className="transaction-desc">{t.description}</span>}
            <span className="transaction-date">{formatDate(t.date)}</span>
            {t.isRecurring && <span className="recurring-badge">Recurring</span>}
          </div>
          <div className="transaction-actions">
            <button className="icon-button" onClick={() => onEdit(t)} title="Edit"><PieChart size={14} /></button>
            <button className="icon-button danger" onClick={() => onDelete(t.id)} title="Delete"><Trash2 size={14} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportCard({ title, income, expense, net, periodLabel, children }: {
  title: string;
  income: number;
  expense: number;
  net: number;
  periodLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="report-card">
      <div className="report-header">
        <div>
          <span className="report-title">{title}</span>
          <span className="report-period">{periodLabel}</span>
        </div>
      </div>
      <div className="report-summary">
        <div className="report-value income">
          <DollarSign size={20} /> <span>{formatCurrency(income)}</span>
        </div>
        <div className="report-value expense">
          <DollarSign size={20} /> <span>{formatCurrency(expense)}</span>
        </div>
        <div className={`report-value net ${net >= 0 ? 'positive' : 'negative'}`}>
          <DollarSign size={20} /> <span>{formatCurrency(net)}</span>
        </div>
      </div>
      {children}
    </div>
  );
}

function CategoryBreakdown({ data, type }: { data: Record<string, number>; type: 'income' | 'expense' }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  
  if (entries.length === 0) return null;

  return (
    <div className="category-breakdown">
      <h4>{type === 'income' ? 'Income Sources' : 'Expense Categories'}</h4>
      <div className="category-bars">
        {entries.map(([cat, value]) => (
          <div key={cat} className="category-bar">
            <div className="category-info">
              <span className="category-name">{getCategoryLabel(cat)}</span>
              <span className="category-amount">{formatCurrency(value)}</span>
            </div>
            <div className="category-bar-track">
              <div className={`category-bar-fill ${type}`} style={{ width: `${total > 0 ? (value / total * 100) : 0}%` }} />
            </div>
            <span className="category-percent">{total > 0 ? Math.round(value / total * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FinancePanel({ api }: { api: Api }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReport | null>(null);
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [filterType, setFilterType] = useState<'INCOME' | 'EXPENSE' | 'ALL'>('ALL');
  const [loading, setLoading] = useState(true);

  async function loadData() {
    try {
      const [txs, weekly, monthly] = await Promise.all([
        api<Transaction[]>('/transactions'),
        api<WeeklyReport>('/transactions/report/weekly'),
        api<MonthlyReport>(`/transactions/report/monthly?year=${currentMonth.getFullYear()}&month=${currentMonth.getMonth() + 1}`)
      ]);
      setTransactions(txs);
      setWeeklyReport(weekly);
      setMonthlyReport(monthly);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load finance data:', error);
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [currentMonth]);

  async function handleAddTransaction(data: { type: 'INCOME' | 'EXPENSE'; category: string; amount: number; date: string; description?: string }) {
    await api('/transactions', { method: 'POST', body: JSON.stringify(data) });
    setShowForm(false);
    loadData();
  }

  async function handleUpdateTransaction(data: { type: 'INCOME' | 'EXPENSE'; category: string; amount: number; date: string; description?: string }) {
    if (!editingTransaction) return;
    await api(`/transactions/${editingTransaction.id}`, { method: 'PUT', body: JSON.stringify(data) });
    setEditingTransaction(null);
    setShowForm(false);
    loadData();
  }

  async function handleDeleteTransaction(id: string) {
    if (!confirm('Delete this transaction?')) return;
    await api(`/transactions/${id}`, { method: 'DELETE' });
    loadData();
  }

  function handleEdit(t: Transaction) {
    setEditingTransaction(t);
    setShowForm(true);
  }

  function handleMonthChange(delta: number) {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(currentMonth.getMonth() + delta);
    setCurrentMonth(newMonth);
  }

  const monthlyIncome = monthlyReport?.summary.income ?? 0;
  const monthlyExpense = monthlyReport?.summary.expense ?? 0;
  const monthlyNet = monthlyReport?.summary.net ?? 0;
  const weeklyIncome = weeklyReport?.weekly.income ?? 0;
  const weeklyExpense = weeklyReport?.weekly.expense ?? 0;
  const weeklyNet = weeklyReport?.weekly.net ?? 0;

  return (
    <section className="panel finance-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Finance Tracker</span>
          <h2>Income & Expenses</h2>
        </div>
        <button className="finance-button primary" onClick={() => { setEditingTransaction(null); setShowForm(true); }}>
          <Plus size={18} /> Add Transaction
        </button>
      </div>

      {showForm && (
        <div className="finance-modal-overlay" onClick={() => { setShowForm(false); setEditingTransaction(null); }}>
          <div className="finance-modal" onClick={e => e.stopPropagation()}>
            <h3>{editingTransaction ? 'Edit Transaction' : 'Add Transaction'}</h3>
            <TransactionForm
              onSubmit={editingTransaction ? handleUpdateTransaction : handleAddTransaction}
              onCancel={() => { setShowForm(false); setEditingTransaction(null); }}
              initialType={editingTransaction?.type}
              initialCategory={editingTransaction?.category}
              initialAmount={editingTransaction?.amount}
              initialDate={editingTransaction?.date?.slice(0, 10)}
              initialDescription={editingTransaction?.description}
            />
          </div>
        </div>
      )}

      <div className="reports-grid">
        <ReportCard
          title="This Week"
          income={weeklyIncome}
          expense={weeklyExpense}
          net={weeklyNet}
          periodLabel={weeklyReport ? `${weeklyReport.period.weekStart} - ${weeklyReport.period.weekEnd}` : ''}
        >
          <CategoryBreakdown data={weeklyReport?.monthly.byCategory.income ?? {}} type="income" />
          <CategoryBreakdown data={weeklyReport?.monthly.byCategory.expense ?? {}} type="expense" />
        </ReportCard>

        <ReportCard
          title={`Month of ${currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`}
          income={monthlyIncome}
          expense={monthlyExpense}
          net={monthlyNet}
          periodLabel={monthlyReport ? `${monthlyReport.period.monthStart} - ${monthlyReport.period.monthEnd}` : ''}
        >
          <CategoryBreakdown data={monthlyReport?.byCategory.income ?? {}} type="income" />
          <CategoryBreakdown data={monthlyReport?.byCategory.expense ?? {}} type="expense" />
        </ReportCard>
      </div>

      <div className="finance-controls">
        <div className="month-nav">
          <button className="icon-button" onClick={() => handleMonthChange(-1)}><ChevronLeft size={18} /></button>
          <span className="month-label">{currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
          <button className="icon-button" onClick={() => handleMonthChange(1)}><ChevronRight size={18} /></button>
        </div>
        <div className="filter-tabs">
          <button className={filterType === 'ALL' ? 'active' : ''} onClick={() => setFilterType('ALL')}>All</button>
          <button className={filterType === 'INCOME' ? 'active' : ''} onClick={() => setFilterType('INCOME')}>Income</button>
          <button className={filterType === 'EXPENSE' ? 'active' : ''} onClick={() => setFilterType('EXPENSE')}>Expenses</button>
        </div>
      </div>

      {loading ? (
        <div className="finance-loading">Loading...</div>
      ) : (
        <TransactionList
          transactions={transactions}
          onDelete={handleDeleteTransaction}
          onEdit={handleEdit}
          filterType={filterType === 'ALL' ? undefined : filterType}
        />
      )}
    </section>
  );
}