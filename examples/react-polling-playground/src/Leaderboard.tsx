import { STOCKS } from './stocks';
import StockRow from './StockRow';

type Props = {
  onSelect: (ticker: string) => void;
};

export default function Leaderboard({ onSelect }: Props) {
  return (
    <section>
      <h1 className="page-title">Stocks</h1>
      <p className="lede">
        Each stock is a room. Enter one to see how many people are watching it
        right now.
      </p>
      <ul className="stock-list">
        {STOCKS.map((stock) => (
          <li key={stock.ticker}>
            <StockRow stock={stock} onSelect={onSelect} />
          </li>
        ))}
      </ul>
    </section>
  );
}
