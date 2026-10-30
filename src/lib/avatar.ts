// Hero avatar: how far the pupils move towards the cursor

// The furthest the pupils move from centre, in SVG units (the viewBox is 200 wide)
const MAX_OFFSET = 4.5;
// The cursor has to be this far from the eyes, in px, for the pupils to reach MAX_OFFSET
const FULL_REACH = 260;

// Pupil offset in SVG units for a cursor `dx`, `dy` px away from the eyes: towards the cursor,
// growing with distance up to MAX_OFFSET
export const pupilOffset = (dx: number, dy: number): { x: number; y: number } => {
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return { x: 0, y: 0 };
  const reach = Math.min(1, distance / FULL_REACH) * MAX_OFFSET;
  return { x: (dx / distance) * reach, y: (dy / distance) * reach };
};
