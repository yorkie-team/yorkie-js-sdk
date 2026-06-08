export function ViewCountBadge({ count }: { count: string }) {
  return (
    <div className="badge">
      <strong>{count}</strong> {count === '1' ? 'view' : 'views'} today
    </div>
  );
}
