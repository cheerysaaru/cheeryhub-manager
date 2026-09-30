import { AlertTriangle, CheckCircle2, Circle, Clock } from 'lucide-react';
import { Badge } from './Badge';
import { Button } from './Button';
import { useLongPress } from '../hooks/useLongPress';
import { formatDeadline } from '../utils/deadline';
import type { Task } from '../types';

interface TaskRowProps {
  task: Task;
  onToggle: (task: Task) => void;
  onDone: (task: Task) => void;
  /** Opens the long-press menu; only supplied for overdue tasks. */
  onOverdueMenu?: (task: Task) => void;
  bind?: (label: string) => Record<string, unknown>;
}

export function TaskRow({ task, onToggle, onDone, onOverdueMenu, bind }: TaskRowProps) {
  const overdue = task.isOverdue && task.status !== 'COMPLETED';
  const longPress = useLongPress(() => onOverdueMenu?.(task));

  const contextBindings = !overdue && bind ? bind(task.title) : {};
  const pressBindings = overdue && onOverdueMenu ? longPress.handlers : {};

  return (
    <li
      className={`task-row ${overdue ? 'overdue' : ''} ${task.checkedToday ? 'completed' : ''} ${overdue ? 'long-press-target' : ''} ${overdue && longPress.pressing ? 'pressing' : ''}`}
      {...contextBindings}
      {...pressBindings}
    >
      <button
        className="task-check"
        onClick={() => onToggle(task)}
        aria-label={task.checkedToday ? 'Uncheck task' : 'Check in task'}
        aria-pressed={task.checkedToday}
      >
        {task.checkedToday ? <CheckCircle2 size={22} /> : <Circle size={22} />}
      </button>
      <div className="task-content">
        <input className="task-title" value={task.title} readOnly aria-label="Task title" />
        <div className="task-meta">
          {task.dueAt && (
            <span className="task-time">
              <Clock size={14} />
              {formatDeadline(task.dueAt)}
            </span>
          )}
          {!task.dueAt && task.scheduledTime && (
            <span className="task-time">
              <Clock size={14} />
              {task.scheduledTime}
            </span>
          )}
          {overdue && (
            <Badge variant="danger" className="overdue-badge">
              <AlertTriangle size={10} />
              Overdue
            </Badge>
          )}
          {overdue && <span className="long-press-hint">Hold for options</span>}
          {task.recurrence !== 'NONE' && (
            <Badge variant="outline" className="recurrence-badge">
              {task.recurrence.toLowerCase()}
            </Badge>
          )}
        </div>
      </div>
      <div className="task-actions">
        <Button variant="ghost" size="sm" onClick={() => onDone(task)}>
          <CheckCircle2 size={16} /> Done
        </Button>
      </div>
      {overdue && <span className="long-press-progress" aria-hidden="true" />}
    </li>
  );
}
