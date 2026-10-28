/**
 * ChronosOS - Window Coordinate Space & Matrix Math
 * Multi-layer coordinate transforms, high-DPI scaling, and 8pt UI/UX ProMax grid snapping
 */

import { Point2D, Rect2D, SystemConstants } from '../core/types.js';

export class CoordinateSpace {
  constructor(gridUnit = SystemConstants.GRID_SIZE_PX) {
    this.gridUnit = gridUnit; // 8px
  }

  /**
   * Snap a coordinate to the nearest 8pt grid line
   */
  snap(value) {
    return Math.round(value / this.gridUnit) * this.gridUnit;
  }

  /**
   * Snap a 2D point to the 8pt grid
   */
  snapPoint(x, y) {
    return new Point2D(this.snap(x), this.snap(y));
  }

  /**
   * Snap a window rectangle's position and dimensions to 8pt grid
   */
  snapRect(rect) {
    return new Rect2D(
      this.snap(rect.x),
      this.snap(rect.y),
      Math.max(this.gridUnit * 20, this.snap(rect.width)),
      Math.max(this.gridUnit * 15, this.snap(rect.height))
    );
  }

  /**
   * Convert global screen coordinates to window-local coordinates
   */
  screenToWindow(screenX, screenY, windowRect) {
    return new Point2D(screenX - windowRect.x, screenY - windowRect.y);
  }

  /**
   * Convert global screen coordinates to window client-area coordinates
   * (subtracting titlebar and border thickness)
   */
  screenToClient(screenX, screenY, windowRect, titlebarHeight = 32, borderThickness = 1) {
    return new Point2D(
      screenX - windowRect.x - borderThickness,
      screenY - windowRect.y - titlebarHeight - borderThickness
    );
  }

  /**
   * Clamp window bounds within usable desktop workspace
   */
  clampToWorkspace(rect, workspaceWidth, workspaceHeight, titlebarHeight = 32) {
    const clamped = rect.clone();

    // Prevent dragging titlebar above or below viewport
    clamped.y = Math.max(0, Math.min(clamped.y, workspaceHeight - titlebarHeight));
    
    // Allow partial horizontal overlap but ensure at least 64px remains visible
    clamped.x = Math.max(-(clamped.width - 64), Math.min(clamped.x, workspaceWidth - 64));

    // Ensure window dimensions do not exceed workspace
    clamped.width = Math.min(clamped.width, workspaceWidth);
    clamped.height = Math.min(clamped.height, workspaceHeight);

    return clamped;
  }
}

export const KernelCoordinates = new CoordinateSpace();
