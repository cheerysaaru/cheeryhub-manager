import { useState } from 'react';
import { Plus, Trash2, Pencil, Download, BarChart2, PieChart, DollarSign, ArrowUpRight, ArrowDownRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTransactions } from '../hooks/useTransactions';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Modal, ConfirmDialog } from '../components/Modal';
import { ContextMenu, useContextMenu } from '../components/ContextMenu';
import { Input } from '../components/Input';
import type { Transaction, WeeklyReport, MonthlyReport } from '../types';
import { formatShortDate } from '../utils/date';
import { downloadJson } from '../utils/misc';

const INCOME_CATEGORIES = ['SALARY', 'FREELANCE', 'INVESTMENTS', 'BUSINESS', 'GIFTS', 'REFUNDS', 'OTHER_INCOME'];
const EXPENSE_CATEGORIES = [
  'HOUSING', 'FOOD', 'TRANSPORTATION', 'UTILITIES', 'HEALTHCARE', 'ENTERTAINMENT',
  'SHOPPING', 'EDUCATION', 'PERSONAL_CARE', 'SUBSCRIPTIONS', 'INSURANCE',
  'DEBT_PAYMENTS', 'SAVINGS', 'INVESTMENTS_EXPENSE', 'GIFTS_DONATIONS', 'OTHER_EXPENSE',
];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function getCategoryLabel(category: string) {
  return category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function TransactionForm({ onSubmit, onCancel, initial }: {
  onSubmit: (data: Partial<Transaction>) => void;
  onCancel: () => void;
  initial?: Transaction;
}) {
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>(initial?.type ?? 'EXPENSE');
  const [category, setCategory] = useState(initial?.category ?? 'FOOD');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [date, setDate] = useState(initial?.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState(initial?.description ?? '');

  const categories = type === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  function handleTypeChange(newType: 'INCOME' | 'EXPENSE') {
    setType(newType);
    if (!initial) {
      setCategory(newType === 'INCOME' ? 'SALARY' : 'FOOD');
    }
  }

  return (
    <form className="modal-form" onSubmit={(e) => {
      e.preventDefault();
      if (!amount || parseFloat(amount) <= 0) return;
      onSubmit({ type, category, amount: parseFloat(amount), date, description: description || undefined });
    }}>
      <div className="form-row">
        <div className="form-group">
          <label className="input-label">Type</label>
          <div className="type-toggle">
            <button type="button" className={type === 'INCOME' ? 'active' : ''} onClick={() => handleTypeChange('INCOME')}>
              <ArrowUpRight size={16} /> Income
            </button>
            <button type="button" className={type === 'EXPENSE' ? 'active' : ''} onClick={() => handleTypeChange('EXPENSE')}>
              <ArrowDownRight size={16} /> Expense
            </button>
          </div>
        </div>
        <label className="input-label">
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="select">
            {categories.map((c) => <option key={c} value={c}>{getCategoryLabel(c)}</option>)}
          </select>
        </label>
      </div>
      <div className="form-row">
        <Input label="Amount" type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was this for?" />
      <div className="modal-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit">{initial ? 'Update' : 'Add Transaction'}</Button>
      </div>
    </form>
  );
}

function CategoryBreakdown({ data, type }: { data: Record<string, number>; type: 'income' | 'expense' }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  if (!entries.length) return null;
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
              <div className={`category-bar-fill ${type}`} style={{ width: `${total > 0 ? (value / total) * 100 : 0}%` }} />
            </div>
            <span className="category-percent">{total > 0 ? Math.round((value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportCard({ title, income, expense, net, periodLabel, children }: {
  title: string; income: number; expense: number; net: number; periodLabel: string; children?: React.ReactNode;
}) {
  return (
    <Card className="report-card" padding="md">
      <div className="report-header">
        <span className="report-title">{title}</span>
        <span className="report-period">{periodLabel}</span>
      </div>
      <div className="report-summary">
        <div className="report-value income"><DollarSign size={18} /> {formatCurrency(income)}</div>
        <div className="report-value expense"><DollarSign size={18} /> {formatCurrency(expense)}</div>
        <div className={`report-value net ${net >= 0 ? 'positive' : 'negative'}`}><DollarSign size={18} /> {formatCurrency(net)}</div>
      </div>
      {children}
    </Card>
  );
}

export default function FinancePage() {
  const { user } = useAuth();
  const { transactions, weeklyReport, monthlyReport, loading, fetchReports, create, update, remove } = useTransactions(user?.id ?? null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [filterType, setFilterType] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const txMenu = useContextMenu();

  async function handleSubmit(data: Partial<Transaction>) {
    if (editing) await update(editing.id, data);
    else await create(data);
    setShowForm(false);
    setEditing(null);
    fetchReports(currentMonth.getFullYear(), currentMonth.getMonth() + 1);
  }

  function handleEdit(t: Transaction) {
    setEditing(t);
    setShowForm(true);
  }

  function shiftMonth(delta: number) {
    const m = new Date(currentMonth);
    m.setMonth(currentMonth.getMonth() + delta);
    setCurrentMonth(m);
    fetchReports(m.getFullYear(), m.getMonth() + 1);
  }

  function handleExport() {
    downloadJson(`finance-${new Date().toISOString().slice(0, 10)}.json`, transactions);
  }

  const filtered = filterType === 'ALL' ? transactions : transactions.filter((t) => t.type === filterType);
  const wi = weeklyReport?.weekly.income ?? 0;
  const we = weeklyReport?.weekly.expense ?? 0;
  const mi = monthlyReport?.summary.income ?? 0;
  const me = monthlyReport?.summary.expense ?? 0;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Finance</p>
          <h1>Income & Expenses</h1>
        </div>
        <Button size="lg" onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus size={20} /> Add Transaction
        </Button>
      </header>

      <div className="reports-grid">
        <ReportCard title="This Week" income={wi} expense={we} net={wi - we} periodLabel={weeklyReport ? `${weeklyReport.period.weekStart} – ${weeklyReport.period.weekEnd}` : ''}>
          <CategoryBreakdown data={weeklyReport?.monthly.byCategory.income ?? {}} type="income" />
          <CategoryBreakdown data={weeklyReport?.monthly.byCategory.expense ?? {}} type="expense" />
        </ReportCard>
        <ReportCard title={`Month of ${currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`} income={mi} expense={me} net={mi - me} periodLabel={monthlyReport ? `${monthlyReport.period.monthStart} – ${monthlyReport.period.monthEnd}` : ''}>
          <CategoryBreakdown data={monthlyReport?.byCategory.income ?? {}} type="income" />
          <CategoryBreakdown data={monthlyReport?.byCategory.expense ?? {}} type="expense" />
        </ReportCard>
      </div>

      <div className="finance-controls">
        <div className="month-nav">
          <Button variant="outline" size="sm" onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft size={18} /></Button>
          <span className="month-label">{currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
          <Button variant="outline" size="sm" onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight size={18} /></Button>
        </div>
        <div className="filter-tabs">
          {(['ALL', 'INCOME', 'EXPENSE'] as const).map((f) => (
            <button key={f} className={`filter-tab ${filterType === f ? 'active' : ''}`} onClick={() => setFilterType(f)}>
              {f === 'ALL' ? 'All' : f === 'INCOME' ? 'Income' : 'Expenses'}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={handleExport}><Download size={16} /> Export</Button>
      </div>

      <section className="panel">
        {loading ? (
          <div className="page-loading">Loading transactions…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <DollarSign size={32} />
            <strong>No transactions yet</strong>
            <p>Add your first transaction above.</p>
          </div>
        ) : (
          <ul className="transaction-list">
            {filtered.map((t) => (
              <li
                key={t.id}
                className={`transaction-item ${t.type.toLowerCase()}`}
                {...txMenu.bind(t.description || getCategoryLabel(t.category))}
              >
                <div className="transaction-main">
                  <span className="transaction-category">{getCategoryLabel(t.category)}</span>
                  <span className={`transaction-amount ${t.type === 'INCOME' ? 'positive' : 'negative'}`}>
                    {t.type === 'INCOME' ? '+' : '-'}{formatCurrency(t.amount)}
                  </span>
                </div>
                <div className="transaction-meta">
                  {t.description && <span className="transaction-desc">{t.description}</span>}
                  <span className="transaction-date">{formatShortDate(t.date)}</span>
                  {t.isRecurring && <Badge variant="info" size="sm">Recurring</Badge>}
                </div>
                <div className="transaction-actions">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(t)} aria-label="Edit"><Pencil size={14} /></Button>
                  <Button variant="ghost" size="sm" className="danger-ghost" onClick={() => setDeleteTarget(t)} aria-label="Delete"><Trash2 size={14} /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal isOpen={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? 'Edit Transaction' : 'Add Transaction'}>
        <TransactionForm onSubmit={handleSubmit} onCancel={() => { setShowForm(false); setEditing(null); }} initial={editing ?? undefined} />
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => { if (deleteTarget) { await remove(deleteTarget.id); setDeleteTarget(null); fetchReports(currentMonth.getFullYear(), currentMonth.getMonth() + 1); } }}
        title="Delete transaction?"
        message={`${deleteTarget ? formatCurrency(deleteTarget.amount) : ''} entry will be permanently deleted.`}
        confirmText="Delete"
        variant="danger"
      />
      <ContextMenu
        state={txMenu.menu}
        onClose={txMenu.close}
        onEdit={() => {
          if (!txMenu.menu) return;
          const tx = filtered.find((t) => (t.description || getCategoryLabel(t.category)) === txMenu.menu?.label);
          if (tx) handleEdit(tx);
        }}
        onDelete={() => {
          if (!txMenu.menu) return;
          const tx = filtered.find((t) => (t.description || getCategoryLabel(t.category)) === txMenu.menu?.label);
          if (tx) setDeleteTarget(tx);
        }}
        editLabel="Edit transaction"
        deleteLabel="Delete transaction"
      />
    </div>
  );
}