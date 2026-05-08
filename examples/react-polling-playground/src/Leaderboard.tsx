import { STOCKS } from './stocks';
import StockRow from './StockRow';

type Props = {
  onSelect: (ticker: string) => void;
};

export default function Leaderboard({ onSelect }: Props) {
  return (
    <div className="leaderboard">
      <div className="leaderboard-head">
        <span className="col-rank">#</span>
        <span className="col-id">Stock</span>
        <span className="col-cta">&nbsp;</span>
      </div>
      {STOCKS.map((stock, idx) => (
        <StockRow
          key={stock.ticker}
          stock={stock}
          rank={idx + 1}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
