import { CheckCircle2, CircleX, Coffee, RotateCcw } from "lucide-react";
import {
  ContextMenu,
  type ContextMenuState,
  type MenuItem,
} from "./ContextMenu";
import {
  formatShortFullDate,
  type DayStatus,
} from "../utils/commitmentCalendar";

export type DayAction = "undo" | "checkin" | "fail" | "leave";

export interface DayMenuTarget extends ContextMenuState {
  habitId: string;
  date: string;
  status: DayStatus;
}

export interface DayContextMenuProps {
  target: DayMenuTarget | null;
  pending?: boolean;
  onClose: () => void;
  onAction: (habitId: string, date: string, action: DayAction) => void;
}

/**
 * Popover for one commitment day: full date in the heading plus the actions
 * available from that day's current status. Locked/future days never get a
 * target, so only editable days can open it.
 */
export function DayContextMenu({
  target,
  pending,
  onClose,
  onAction,
}: DayContextMenuProps) {
  if (!target) return null;

  const items: MenuItem[] = [];
  if (
    target.status !== "EMPTY" &&
    target.status !== "NOT_STARTED" &&
    target.status !== "FUTURE"
  ) {
    items.push({
      key: "undo",
      label: "Undo (clear)",
      icon: <RotateCcw size={15} />,
      onClick: () => onAction(target.habitId, target.date, "undo"),
    });
  }
  if (target.status !== "COMPLETED") {
    items.push({
      key: "checkin",
      label: "Check in",
      icon: <CheckCircle2 size={15} />,
      onClick: () => onAction(target.habitId, target.date, "checkin"),
    });
  }
  if (target.status !== "FAILED") {
    items.push({
      key: "fail",
      label: "Mark as failed",
      icon: <CircleX size={15} />,
      onClick: () => onAction(target.habitId, target.date, "fail"),
    });
  }
  if (target.status !== "SKIPPED") {
    items.push({
      key: "leave",
      label: "Mark as leave",
      icon: <Coffee size={15} />,
      onClick: () => onAction(target.habitId, target.date, "leave"),
    });
  }

  return (
    <ContextMenu
      state={target}
      title={formatShortFullDate(target.date)}
      items={items.map((item) =>
        pending ? { ...item, disabled: true } : item,
      )}
      onClose={onClose}
    />
  );
}
