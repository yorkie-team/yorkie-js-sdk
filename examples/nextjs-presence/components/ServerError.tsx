import { API_ADDR } from '@/lib/rooms';

export default function ServerError() {
  return (
    <section className="card message" role="alert">
      <h2 className="card-title">Couldn&apos;t connect</h2>
      <p>
        Couldn&apos;t reach the Yorkie server at <code>{API_ADDR}</code>. Check
        that it&apos;s running, then reload.
      </p>
    </section>
  );
}
