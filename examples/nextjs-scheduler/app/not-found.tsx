import Link from 'next/link';
import styles from './styles/page.module.css';

export default function NotFound() {
  return (
    <main className={styles.main}>
      <p className={styles.message}>
        Page not found. <Link href="/">Back to the calendar</Link>
      </p>
    </main>
  );
}
