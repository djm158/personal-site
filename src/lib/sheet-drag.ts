// Pull-down-to-dismiss for a bottom sheet: whether a drag that ended should close the sheet

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
