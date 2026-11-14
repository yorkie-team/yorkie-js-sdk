import type { Stock } from './stocks';
import { ChevronRight } from './icons';

type Props = {
  stock: Stock;
  onSelect: (ticker: string) => void;
};

export default function StockRow({ stock, onSelect }: Props) {
  return (
    <button
      type="button"
      className="stock-row"
      onClick={() => onSelect(stock.ticker)}
    >
      <span className="stock-id">
        <span className="ticker">{stock.ticker}</span>
        <span className="name">{stock.name}</span>
      </span>
      <span className="market">{stock.market}</span>
      <span className="cta">
        Enter room <ChevronRight />
      </span>
    </button>
  );
}
