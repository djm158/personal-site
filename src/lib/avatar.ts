// Hero avatar: how far the pupils move towards the cursor, or towards whatever else has its eye

/**
 * Fired on document to point the avatar's eyes somewhere other than the cursor. The detail is a
 * point in viewport px to look at, or null to hand the eyes back to the cursor. The cyclist
 * easter egg (Ride.astro) sends one each frame so the avatar watches him ride.
 */
export const LOOK_EVENT = "avatarlook";
export type LookTarget = { x: number; y: number } | null;

// The furthest the pupils move from centre, in SVG units (the viewBox is 200 wide)
const MAX_OFFSET = 4.5;
// The cursor has to be this far from the eyes, in px, for the pupils to reach MAX_OFFSET
const FULL_REACH = 260;

// Pupil offset in SVG units for a cursor `dx`, `dy` px away from the eyes: towards the cursor,
// growing with distance up to MAX_OFFSET
export const pupilOffset = (
  dx: number,
  dy: number,
): { x: number; y: number } => {
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return { x: 0, y: 0 };
  const reach = Math.min(1, distance / FULL_REACH) * MAX_OFFSET;
  return { x: (dx / distance) * reach, y: (dy / distance) * reach };
};
