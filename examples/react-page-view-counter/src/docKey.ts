function todayYYYYMMDD(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

export function buildPvDocKey(topicId: string): string {
  return `pv-${topicId}-${todayYYYYMMDD()}`;
}
