import type { Stock } from './stocks';

type Props = {
  stock: Stock;
  rank: number;
  onSelect: (ticker: string) => void;
};

export default function StockRow({ stock, rank, onSelect }: Props) {
  const flagText = stock.market === 'KR' ? '🇰🇷' : '🇺🇸';

  return (
    <button
      type="button"
      className="stock-row"
      onClick={() => onSelect(stock.ticker)}
    >
      <div className="stock-rank">{rank}</div>
      <div className="stock-id">
        <span className="ticker">{stock.ticker}</span>
        <span className="name">
          {flagText} {stock.name}
        </span>
      </div>
      <div className="cta">Watch live →</div>
    </button>
  );
}
