type Tone = "neutral" | "active" | "warning" | "danger";

const toneMap: Record<Tone, string> = {
  neutral: "status-pill--neutral",
  active: "status-pill--active",
  warning: "status-pill--warning",
  danger: "status-pill--danger",
};

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return <span className={`status-pill ${toneMap[tone]}`}>{label}</span>;
}
