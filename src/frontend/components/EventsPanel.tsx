import { useDeferredValue } from "react";
import type { RuntimeLogLevel } from "../../shared/api";

export type UiEvent = {
  id: string;
  timestamp: string;
  level: RuntimeLogLevel | "system";
  title: string;
  message: string;
};

type EventsPanelProps = {
  events: UiEvent[];
};

function levelClass(level: UiEvent["level"]): string {
  if (level === "error") {
    return "log-item--error";
  }
  if (level === "warn") {
    return "log-item--warn";
  }
  if (level === "info") {
    return "log-item--info";
  }
  return "log-item--system";
}

function prettyTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return date.toLocaleTimeString();
}

export function EventsPanel({ events }: EventsPanelProps) {
  const deferredEvents = useDeferredValue(events);

  return (
    <section className="console-card events-panel">
      <header className="console-card__header">
        <p className="card-kicker">Ops Feed</p>
        <h2>Event Log</h2>
      </header>

      <ul className="event-list">
        {deferredEvents.length === 0 ? (
          <li className="event-empty">No events yet. Runtime telemetry will appear here.</li>
        ) : (
          deferredEvents.map((event) => (
            <li key={event.id} className={`log-item ${levelClass(event.level)}`}>
              <div className="row-between">
                <strong>{event.title}</strong>
                <time>{prettyTime(event.timestamp)}</time>
              </div>
              <p>{event.message}</p>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
