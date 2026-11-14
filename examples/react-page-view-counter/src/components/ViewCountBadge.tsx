export function ViewCountBadge({ count }: { count: string }) {
  return (
    <p className="badge">
      <strong>{count}</strong> {count === '1' ? 'view' : 'views'} today
    </p>
  );
}
