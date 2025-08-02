import { useDocumentSelector } from '../hooks/useDocumentSelector';

/**
 * CounterNumber component displays the current value of the counter.
 */
export function CounterNumber() {
  const { counter } = useDocumentSelector(({ root }) => ({
    counter: root.counter,
  }));

  return <div id="counter-value">{counter}</div>;
}
