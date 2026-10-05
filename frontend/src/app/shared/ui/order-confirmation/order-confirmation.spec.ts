import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OrderPricingType, OrderResponse, OrderSide, OrderStatus } from '../../../api/generated/trade';
import { OrderConfirmation } from './order-confirmation';

const ORDER = {
  orderId: '77',
  status: OrderStatus.New,
  message: 'Order placed successfully',
  symbol: 'AAPL',
  side: OrderSide.Buy,
  orderPricingType: OrderPricingType.Market,
  quantity: 1500,
  price: null,
} as unknown as OrderResponse;

describe('OrderConfirmation', () => {
  let fixture: ComponentFixture<OrderConfirmation>;
  let root: HTMLElement;

  const byTestId = (id: string) => root.querySelector<HTMLElement>(`[data-testid="${id}"]`);

  async function show(order: Partial<OrderResponse>, currency: string | null = null): Promise<void> {
    fixture.componentRef.setInput('order', { ...ORDER, ...order });
    fixture.componentRef.setInput('currency', currency);
    await fixture.whenStable();
  }

  beforeEach(() => {
    fixture = TestBed.createComponent(OrderConfirmation);
    root = fixture.nativeElement as HTMLElement;
  });

  it.each([
    [OrderStatus.Filled, OrderPricingType.Market, 'has been filled'],
    [OrderStatus.Rejected, OrderPricingType.Market, 'was rejected'],
    [OrderStatus.Cancelled, OrderPricingType.Market, 'was cancelled'],
    [OrderStatus.New, OrderPricingType.Market, 'filled at the live market price'],
    [OrderStatus.New, OrderPricingType.Limit, 'when the price reaches your limit'],
  ])('explains a %s %s order', async (status, orderPricingType, sentence) => {
    await show({ status, orderPricingType });

    expect(byTestId('order-explanation')?.textContent).toContain(sentence);
  });

  it('shows the order number, side, type and quantity', async () => {
    await show({ side: OrderSide.Sell, quantity: 1500 });

    expect(byTestId('order-id')?.textContent).toBe('#77');
    expect(root.querySelector('.result-title')?.textContent).toContain('Sell order placed');
    expect(root.textContent).toContain('Market');
    expect(root.textContent).toContain('1,500');
  });

  it('shows "Market price" for a market order and the limit for a limit order', async () => {
    await show({});
    expect(root.textContent).toContain('Market price');

    await show({ orderPricingType: OrderPricingType.Limit, price: 199.5 }, 'USD');
    expect(root.textContent).toContain('$199.50');

    await show({ orderPricingType: OrderPricingType.Limit, price: 199.5 }, null);
    expect(root.textContent).toContain('199.50');
  });

  it('offers to place another order or finish', async () => {
    await show({});
    const another = vi.fn();
    const done = vi.fn();
    fixture.componentInstance.another.subscribe(another);
    fixture.componentInstance.done.subscribe(done);

    root.querySelector<HTMLButtonElement>('.btn.is-secondary')!.click();
    byTestId('order-done')!.click();

    expect(another).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledTimes(1);
  });
});
