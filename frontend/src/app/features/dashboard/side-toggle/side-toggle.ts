import { Component, model } from '@angular/core';
import { OrderSide } from '../../../core/order.service';

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
  readonly side = model<OrderSide>('BUY');
}
