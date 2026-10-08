import { breakdownCsv } from './portfolio-pnl';

describe('breakdownCsv', () => {
  it('has a header naming the currency, then one plain-number row per instrument, with CRLF line ends', () => {
    const csv = breakdownCsv(
      [
        { symbol: 'AAPL', realisedPnl: 100, unrealisedPnl: 43.1, totalPnl: 143.1 },
        { symbol: 'GOOGL', realisedPnl: 0, unrealisedPnl: -32.349, totalPnl: -32.349 },
      ],
      'USD',
    );

    expect(csv).toBe(
      '"Instrument","Realised (USD)","Unrealised (USD)","Total (USD)"\r\n' +
        '"AAPL",100.00,43.10,143.10\r\n' +
        '"GOOGL",0.00,-32.35,-32.35\r\n',
    );
  });

  it('quotes a symbol that has a quote or a comma in it', () => {
    const csv = breakdownCsv([{ symbol: 'A"B,C', realisedPnl: 1, unrealisedPnl: 2, totalPnl: 3 }], 'EUR');

    expect(csv.split('\r\n')[1]).toBe('"A""B,C",1.00,2.00,3.00');
  });

  it('is just the header when there are no instruments', () => {
    expect(breakdownCsv([], 'USD')).toBe('"Instrument","Realised (USD)","Unrealised (USD)","Total (USD)"\r\n');
  });
});
