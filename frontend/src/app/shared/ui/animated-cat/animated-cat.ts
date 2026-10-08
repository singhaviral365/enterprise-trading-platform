import { Component, OnInit, OnDestroy, HostListener, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CatColorService } from './cat-color.service';

/**
 * Animated marshmallow component with blue eyes that follow the cursor.
 * - Cute, squishy marshmallow with multiple animations (bouncing, pulsing, blinking)
 * - Blue eyes that track cursor movement with smooth animation
 * - Different colored marshmallow on different pages (color changes based on current route)
 * - Positioned in bottom-left corner for a friendly presence
 */
@Component({
  selector: 'app-animated-cat',
  templateUrl: './animated-cat.html',
  styleUrl: './animated-cat.css',
  standalone: true,
  imports: [CommonModule],
  host: {
    '[class.sidebar-expanded]': 'isSidebarExpanded()',
  },
})
export class AnimatedCatComponent implements OnInit, OnDestroy {
  private catColorService = inject(CatColorService);
  readonly isSidebarExpanded = input(false);

  catColor = this.catColorService.currentCatColor;

  leftEyeX = 0;
  leftEyeY = 0;
  rightEyeX = 0;
  rightEyeY = 0;

  // Left eye position (relative to marshmallow body)
  private leftEyeBaseX = 40;
  private leftEyeBaseY = 58;

  // Right eye position (relative to marshmallow body)
  private rightEyeBaseX = 92;
  private rightEyeBaseY = 58;

  ngOnInit() {
    // Initialize with default values
    this.updateEyePositions(window.innerWidth / 2, window.innerHeight / 2);
  }

  @HostListener('window:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    this.updateEyePositions(event.clientX, event.clientY);
  }

  private updateEyePositions(cursorX: number, cursorY: number) {
    // The mascot scales with sidebar state: compact in collapsed sidebar, full in expanded sidebar.
    const mascotScale = this.isSidebarExpanded() ? 1.03 : 0.35;
    const containerSize = 170;
    const offsetLeft = 0;
    const offsetBottom = 10;

    // Body geometry scaled from base dimensions.
    const baseBodyWidth = 132;
    const baseBodyHeight = 116;
    const baseBodyBottomInset = 18;
    const baseBodyLeftInset = (containerSize - baseBodyWidth) / 2;

    const bodyWidth = baseBodyWidth * mascotScale;
    const bodyHeight = baseBodyHeight * mascotScale;
    const bodyLeft = offsetLeft + baseBodyLeftInset * mascotScale;
    const bodyTop =
      window.innerHeight - offsetBottom - baseBodyBottomInset * mascotScale - bodyHeight;

    // Calculate eye world positions with active mascot scale.
    const leftEyeWorldX = bodyLeft + this.leftEyeBaseX * mascotScale;
    const leftEyeWorldY = bodyTop + this.leftEyeBaseY * mascotScale;

    const rightEyeWorldX = bodyLeft + this.rightEyeBaseX * mascotScale;
    const rightEyeWorldY = bodyTop + this.rightEyeBaseY * mascotScale;

    // Calculate angles from eyes to cursor
    const leftAngle = Math.atan2(cursorY - leftEyeWorldY, cursorX - leftEyeWorldX);
    const rightAngle = Math.atan2(cursorY - rightEyeWorldY, cursorX - rightEyeWorldX);

    // Calculate pupil positions (moved in the direction of the angle)
    const pupilDistance = 6 * mascotScale;
    this.leftEyeX = Math.cos(leftAngle) * pupilDistance;
    this.leftEyeY = Math.sin(leftAngle) * pupilDistance;

    this.rightEyeX = Math.cos(rightAngle) * pupilDistance;
    this.rightEyeY = Math.sin(rightAngle) * pupilDistance;
  }

  ngOnDestroy() {
    // Cleanup if needed
  }
}
