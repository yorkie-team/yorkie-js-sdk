export type Stock = {
  ticker: string;
  name: string;
  market: 'US' | 'KR';
};

export const STOCKS: ReadonlyArray<Stock> = [
  { ticker: 'NVDA', name: 'NVIDIA', market: 'US' },
  { ticker: 'TSLA', name: 'Tesla', market: 'US' },
  { ticker: 'AAPL', name: 'Apple', market: 'US' },
  { ticker: 'MSFT', name: 'Microsoft', market: 'US' },
  { ticker: '005930', name: '삼성전자', market: 'KR' },
  { ticker: '035420', name: 'NAVER', market: 'KR' },
];
