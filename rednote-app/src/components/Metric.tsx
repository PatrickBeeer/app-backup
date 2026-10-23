export function Metric({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{new Intl.NumberFormat('zh-CN', { notation: 'compact' }).format(value || 0)}</strong>
    </div>
  );
}
