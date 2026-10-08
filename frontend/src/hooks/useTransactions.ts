import { useCallback, useEffect, useState } from "react";
import { api, asArray } from "../services/api";
import type { Transaction, WeeklyReport, MonthlyReport } from "../types";
import { useSocket } from "./useSocket";

function upsertTransaction(
  list: Transaction[],
  tx: Transaction,
): Transaction[] {
  if (!tx?.id) return list;
  if (list.some((t) => t.id === tx.id)) {
    return list.map((t) => (t.id === tx.id ? tx : t));
  }
  return [tx, ...list];
}

export function useTransactions(userId: string | null) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReport | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { on } = useSocket(userId);

  const loadTransactions = useCallback(() => {
    return api<Transaction[]>("/transactions")
      .then((data) => {
        const validTransactions = asArray<Transaction>(data).filter(
          (transaction): transaction is Transaction =>
            Boolean(
              transaction &&
              typeof transaction === "object" &&
              typeof transaction.id === "string" &&
              typeof transaction.type === "string" &&
              typeof transaction.category === "string" &&
              typeof transaction.amount === "number" &&
              typeof transaction.date === "string",
            ),
        );
        const unique = Array.from(
          new Map(
            validTransactions.map((transaction) => [
              transaction.id,
              transaction,
            ]),
          ).values(),
        );
        setTransactions(unique);
      })
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load transactions.",
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const fetchTransactions = useCallback(() => {
    setError(null);
    return loadTransactions();
  }, [loadTransactions]);

  const loadReports = useCallback((year?: number, month?: number) => {
    return Promise.all([
      api<WeeklyReport>("/transactions/report/weekly"),
      api<MonthlyReport>(
        `/transactions/report/monthly?year=${year ?? new Date().getFullYear()}&month=${month ?? new Date().getMonth() + 1}`,
      ),
    ])
      .then(([weekly, monthly]) => {
        setWeeklyReport(weekly);
        setMonthlyReport(monthly);
      })
      .catch((caught: unknown) => {
        setWeeklyReport(null);
        setMonthlyReport(null);
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load transaction reports.",
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const fetchReports = useCallback(
    (year?: number, month?: number) => {
      setError(null);
      return loadReports(year, month);
    },
    [loadReports],
  );

  useEffect(() => {
    loadTransactions();
    loadReports();
    const cleanup = on<Transaction>("transaction:created", (tx) => {
      setTransactions((prev) => upsertTransaction(prev, tx));
    });
    const cleanup2 = on<Transaction>("transaction:updated", (tx) => {
      setTransactions((prev) => upsertTransaction(prev, tx));
    });
    const cleanup3 = on<{ id: string }>("transaction:deleted", ({ id }) => {
      setTransactions((prev) => prev.filter((t) => t.id !== id));
    });
    return () => {
      cleanup();
      cleanup2();
      cleanup3();
    };
  }, [loadTransactions, loadReports, on]);

  const create = useCallback(
    async (data: Partial<Transaction>) => {
      const tx = await api<Transaction>("/transactions", {
        method: "POST",
        body: JSON.stringify(data),
      });
      setTransactions((prev) => upsertTransaction(prev, tx));
      await fetchReports();
      return tx;
    },
    [fetchReports],
  );

  const update = useCallback(
    async (id: string, data: Partial<Transaction>) => {
      const tx = await api<Transaction>(`/transactions/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      setTransactions((prev) => upsertTransaction(prev, tx));
      await fetchReports();
      return tx;
    },
    [fetchReports],
  );

  const remove = useCallback(
    async (id: string) => {
      await api(`/transactions/${id}`, { method: "DELETE" });
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      await fetchReports();
    },
    [fetchReports],
  );

  return {
    transactions,
    weeklyReport,
    monthlyReport,
    loading,
    error,
    fetchTransactions,
    fetchReports,
    create,
    update,
    remove,
  };
}
