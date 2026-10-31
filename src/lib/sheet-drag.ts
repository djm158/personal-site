// Pull-down-to-dismiss for a bottom sheet: whether a drag that ended should close the sheet,
// and the gesture itself

export interface DragSample {
  y: number;
  t: number;
}

// How far back from the last sample the release velocity looks, in ms
const VELOCITY_WINDOW = 100;
// Drag past this share of the sheet's height to close it
const DISMISS_FRACTION = 0.25;
// A downward flick faster than this closes the sheet however short it was, in px/ms
const FLICK_VELOCITY = 0.5;

// Vertical velocity in px/ms (positive is down) over the samples in the last
// `VELOCITY_WINDOW` ms before the last one, so a finger held still before letting go reads as 0
export const releaseVelocity = (samples: readonly DragSample[]): number => {
  const last = samples.at(-1);
  if (!last) return 0;
  const first = samples.find(({ t }) => t >= last.t - VELOCITY_WINDOW) ?? last;
  const dt = last.t - first.t;
  return dt > 0 ? (last.y - first.y) / dt : 0;
};

// Close when the sheet is pulled past about a quarter of its `height`, or on a fast downward
// flick; otherwise snap back. `offset` is how far down the sheet has been dragged, in px.
export const shouldDismiss = (
  offset: number,
  height: number,
  velocity: number,
): boolean =>
  offset > height * DISMISS_FRACTION ||
  (offset > 0 && velocity > FLICK_VELOCITY);

export interface DragToDismiss {
  // Drop any drag in progress and the inline translate, letting the CSS take over
  reset: () => void;
  // Whether a drag moved the sheet since the last press on it, clearing the flag. The click that
  // can follow letting go over the backdrop asks this, so a drag doesn't also close the sheet.
  consumeDrag: () => boolean;
}

// Pull down on `handle` to drag `sheet`. While dragging, `data-dragging` on the sheet turns its
// transition off and an inline translate follows the finger; on release the inline style goes
// and the CSS animates from the dragged position, back up or (via `onDismiss`) down and out.
// `pointercancel` snaps back. Buttons inside the handle stay buttons. Call `reset()` when the
// sheet closes, so a drag cut short (Escape mid-drag) isn't carried over to the next open.
export const dragToDismiss = (
  sheet: HTMLElement,
  handle: HTMLElement,
  onDismiss: () => void,
): DragToDismiss => {
  let drag: { id: number; startY: number; height: number; samples: DragSample[] } | null =
    null;
  let dragMoved = false;

  const offsetOf = (e: PointerEvent) =>
    drag ? Math.max(0, e.clientY - drag.startY) : 0;
  const reset = () => {
    drag = null;
    sheet.removeAttribute("data-dragging");
    sheet.style.removeProperty("translate");
  };
  const endDrag = (e: PointerEvent, cancelled: boolean) => {
    if (!drag || e.pointerId !== drag.id) return;
    const offset = offsetOf(e);
    drag.samples.push({ y: e.clientY, t: e.timeStamp });
    const dismiss =
      !cancelled &&
      shouldDismiss(offset, drag.height, releaseVelocity(drag.samples));
    reset();
    if (dismiss) onDismiss();
  };

  // Presses on a dialog's backdrop land on the dialog too
  sheet.addEventListener("pointerdown", () => (dragMoved = false));
  handle.addEventListener("pointerdown", (e) => {
    if (drag || !e.isPrimary || e.button !== 0) return;
    if (sheet.hasAttribute("data-closing")) return;
    if (e.target instanceof Element && e.target.closest("button")) return;
    handle.setPointerCapture(e.pointerId);
    drag = {
      id: e.pointerId,
      startY: e.clientY,
      height: sheet.offsetHeight,
      samples: [{ y: e.clientY, t: e.timeStamp }],
    };
    sheet.setAttribute("data-dragging", "");
  });
  handle.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const offset = offsetOf(e);
    if (offset > 0) dragMoved = true;
    drag.samples.push({ y: e.clientY, t: e.timeStamp });
    sheet.style.translate = `0 ${offset}px`;
  });
  handle.addEventListener("pointerup", (e) => endDrag(e, false));
  handle.addEventListener("pointercancel", (e) => endDrag(e, true));

  return {
    reset,
    consumeDrag: () => {
      const moved = dragMoved;
      dragMoved = false;
      return moved;
    },
  };
};
