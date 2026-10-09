import { Component, input, model } from '@angular/core';
import { OrderSide } from '../../../api/generated/trade';

/**
 * Buy / Sell switch built on native radio buttons (arrow keys and screen readers work as usual),
 * styled as a segmented control whose highlight slides to the chosen side. Use with `[(side)]`.
 */
@Component({
  selector: 'app-side-toggle',
  templateUrl: './side-toggle.html',
  styleUrl: './side-toggle.css',
})
export class SideToggle {
  readonly side = model<OrderSide>(OrderSide.Buy);
  /** Same height as a form input (40px), for a toggle that sits in a row of fields. */
  readonly compact = input(false);

  protected readonly OrderSide = OrderSide;
}
