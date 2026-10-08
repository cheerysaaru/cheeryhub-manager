import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { combineDateTime, toDateInput, toTimeInput } from "../utils/deadline";

interface DeadlinePickerProps {
  isOpen: boolean;
  title?: string;
  initial?: string | null;
  confirmLabel?: string;
  onConfirm: (iso: string) => void;
  onClose: () => void;
}

/**
 * "Choose a deadline" — date + time in the user's local timezone.
 * Picking a date without changing the time keeps 23:59 as the day's end.
 */
export function DeadlinePicker({
  isOpen,
  title = "Choose a deadline",
  initial,
  confirmLabel = "Save deadline",
  onConfirm,
  onClose,
}: DeadlinePickerProps) {
  const initialDate = initial ? new Date(initial) : null;
  const [date, setDate] = useState(() =>
    initialDate && !Number.isNaN(initialDate.getTime())
      ? toDateInput(initialDate)
      : toDateInput(new Date()),
  );
  const [time, setTime] = useState(() =>
    initialDate && !Number.isNaN(initialDate.getTime())
      ? toTimeInput(initialDate)
      : "23:59",
  );
  const [error, setError] = useState("");

  const [prevProps, setPrevProps] = useState({ isOpen, initial });
  if (isOpen !== prevProps.isOpen || initial !== prevProps.initial) {
    setPrevProps({ isOpen, initial });
    if (isOpen) {
      const source = initial ? new Date(initial) : null;
      setDate(
        source && !Number.isNaN(source.getTime())
          ? toDateInput(source)
          : toDateInput(new Date()),
      );
      setTime(
        source && !Number.isNaN(source.getTime())
          ? toTimeInput(source)
          : "23:59",
      );
      setError("");
    }
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const iso = combineDateTime(date, time);
    if (!iso) {
      setError("Pick a valid date and time.");
      return;
    }
    if (new Date(iso).getTime() <= Date.now()) {
      setError("The deadline must be in the future.");
      return;
    }
    onConfirm(iso);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <form className="modal-form deadline-form" onSubmit={submit}>
        <div className="deadline-fields">
          <label className="field">
            <span>Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              aria-label="Deadline date"
            />
          </label>
          <label className="field">
            <span>Time</span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
              aria-label="Deadline time"
            />
          </label>
        </div>
        <p className="deadline-hint">
          <CalendarClock size={14} /> 23:59 is used when you keep the end of the
          day.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">{confirmLabel}</Button>
        </div>
      </form>
    </Modal>
  );
}
