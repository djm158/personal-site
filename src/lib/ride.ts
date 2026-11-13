// The cyclist easter egg on the home page: the click counter, the route and the rider's pose.
// No DOM here; src/components/Ride.astro measures the page and draws.
//
// Lengths are px in the ride layer's own coordinates (y grows downwards), except the leg
// positions, which are in the rider SVG's viewBox units. Angles are radians. A position on the
// ring is measured clockwise from 3 o'clock, so 12 o'clock is -90° and 10:30 is -135°.

export type Point = { x: number; y: number };
/** Where the wheels touch, and the heading (0 is level and facing right, positive turns clockwise) */
export type Pose = Point & { rot: number };
export type Ring = { cx: number; cy: number; r: number };
export type Cubic = readonly [Point, Point, Point, Point];
/** A curve as points, each with its distance along the curve */
export type Curve = { samples: (Point & { d: number })[]; length: number };

const TURN = Math.PI * 2;
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

// --- Clicks ---

export const CLICKS_TO_FIRE = 5;

/** One click on the avatar: the new count, and whether this click starts the ride or ends it. */
export function countClick(count: number): { count: number; fire: boolean } {
  const next = count + 1;
  return next >= CLICKS_TO_FIRE
    ? { count: 0, fire: true }
    : { count: next, fire: false };
}

/** The line under the avatar after `count` clicks: hints[0] after the first, none at zero. */
export function hintFor(count: number, hints: readonly string[]): string {
  return count > 0 ? (hints[count - 1] ?? "") : "";
}

// --- The rider's size and moving parts ---

export const RIDER_MAX_WIDTH = 112;
export const RIDER_MIN_WIDTH = 64;
// The rider SVG's viewBox, and the point in it that sits on the route: on the ground, midway
// between the wheels
export const RIDER_VIEWBOX = { width: 160, height: 100 };
export const RIDER_ANCHOR = { x: 60, y: 94.3 };
const WHEEL_RADIUS = 21;
// How far the helmet is above the ground, as a share of the rider's width
const RIDER_HEIGHT_RATIO = RIDER_ANCHOR.y / RIDER_VIEWBOX.width;
// 112px beside the design's 162px ring
const RIDER_TO_RING = RIDER_MAX_WIDTH / 162;

/**
 * The rider's width in px: 112 at most, smaller beside a small ring, and small enough to fit
 * in `headroom`, the space above the ring that he crosses at the top of each lap.
 */
export function riderWidthFor(ringRadius: number, headroom: number): number {
  return clamp(
    Math.min(ringRadius * RIDER_TO_RING, headroom / RIDER_HEIGHT_RATIO),
    RIDER_MIN_WIDTH,
    RIDER_MAX_WIDTH,
  );
}

/** How far the wheels have turned, in radians, after rolling `travelled` px. */
export function wheelTurn(travelled: number, riderWidth: number): number {
  return travelled / ((WHEEL_RADIUS * riderWidth) / RIDER_VIEWBOX.width);
}

/** The cranks turn slower than the wheels, as if geared. */
export const crankTurn = (wheel: number): number => wheel / 2.2;

const HIP: Point = { x: 46, y: 37 };
const BOTTOM_BRACKET: Point = { x: 54, y: 71 };
const CRANK_LENGTH = 9;
const LEG_BONE = 21;

/** A leg from the hip to the pedal at `crank` radians: two equal bones, the knee bending forwards. */
export function legFor(crank: number): { knee: Point; foot: Point } {
  const foot = {
    x: BOTTOM_BRACKET.x + CRANK_LENGTH * Math.cos(crank),
    y: BOTTOM_BRACKET.y + CRANK_LENGTH * Math.sin(crank),
  };
  const dx = foot.x - HIP.x;
  const dy = foot.y - HIP.y;
  // never quite straight, so the knee always has an angle to solve for
  const reach = Math.min(Math.hypot(dx, dy), LEG_BONE * 2 - 0.01);
  const angle = Math.atan2(dy, dx) - Math.acos(reach / (2 * LEG_BONE));
  return {
    knee: {
      x: HIP.x + LEG_BONE * Math.cos(angle),
      y: HIP.y + LEG_BONE * Math.sin(angle),
    },
    foot,
  };
}

type LegPaths = { thigh: string; shin: string; shoe: string };

/** SVG path data for both legs and the crank arm between the pedals. */
export function pedalStroke(crank: number): {
  near: LegPaths;
  far: LegPaths;
  crank: string;
} {
  const f = (n: number) => n.toFixed(2);
  const line = (a: Point, b: Point) =>
    `M${f(a.x)} ${f(a.y)} L${f(b.x)} ${f(b.y)}`;
  const paths = ({ knee, foot }: { knee: Point; foot: Point }) => ({
    thigh: line(HIP, knee),
    shin: line(knee, foot),
    shoe: line(
      { x: foot.x - 2.5, y: foot.y + 1 },
      { x: foot.x + 5, y: foot.y + 1 },
    ),
  });
  const near = legFor(crank);
  const far = legFor(crank + Math.PI);
  return {
    near: paths(near),
    far: paths(far),
    crank: line(far.foot, near.foot),
  };
}

// --- The route ---

/** Where the hill meets the ring: 10:30, already heading up and to the right */
export const JOIN = (-135 * Math.PI) / 180;
/** He leaves the ring from the top, heading right */
export const TOP = -Math.PI / 2;

/** The pose on the outside of the ring at `angle`: wheels on the ring, head away from the centre. */
export function ringPose(ring: Ring, angle: number): Pose {
  return {
    x: ring.cx + ring.r * Math.cos(angle),
    y: ring.cy + ring.r * Math.sin(angle),
    rot: angle + Math.PI / 2,
  };
}

export function cubicPoint([a, b, c, d]: Cubic, t: number): Point {
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return {
    x: w[0] * a.x + w[1] * b.x + w[2] * c.x + w[3] * d.x,
    y: w[0] * a.y + w[1] * b.y + w[2] * c.y + w[3] * d.y,
  };
}

/** The curve as `steps` straight pieces, with the distance travelled at each point. */
export function sampleCubic(cubic: Cubic, steps = 160): Curve {
  const samples = [{ ...cubicPoint(cubic, 0), d: 0 }];
  for (let i = 1; i <= steps; i++) {
    const point = cubicPoint(cubic, i / steps);
    const prev = samples[i - 1];
    samples.push({
      ...point,
      d: prev.d + Math.hypot(point.x - prev.x, point.y - prev.y),
    });
  }
  return { samples, length: samples[steps].d };
}

/** The pose `d` px along the curve, heading along the piece it's on. */
export function poseOnCurve({ samples }: Curve, d: number): Pose {
  let i = 1;
  while (i < samples.length - 1 && samples[i].d < d) i++;
  const a = samples[i - 1];
  const b = samples[i];
  const k = clamp((d - a.d) / Math.max(0.001, b.d - a.d), 0, 1);
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    rot: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

// The design's hill runs 275px for a 345px rise. Keeping that slope keeps the climb gentle and
// the curve clear of the ring's left side on its way up to the join
const RUN_PER_RISE = 0.8;

/**
 * Where the climb starts: the middle of the viewport, as designed, or further left when the
 * ring is big or high enough that starting in the middle would make the hill steeper than the
 * design's. Never closer than `margin` to the left edge, which is what limits it when the
 * avatar is stacked above the text.
 */
export function hillStartX(
  width: number,
  join: Point,
  ground: number,
  margin = 16,
): number {
  const run = RUN_PER_RISE * (ground - join.y);
  return Math.min(
    join.x - 1,
    Math.max(margin, Math.min(width / 2, join.x - run)),
  );
}

// The design's handle lengths (150px and 130px) as a share of its 441px start-to-join distance
const FLAT_HANDLE = 0.34;
const JOIN_HANDLE = 0.295;

/**
 * The hill from the ground to the ring: level where it starts, and tangent to the ring where
 * it joins. Neither handle is longer than the run, which keeps x moving right the whole way,
 * so a tall, narrow hill gets steep but never leans back.
 */
export function hillCubic(startX: number, ground: number, ring: Ring): Cubic {
  const join = ringPose(ring, JOIN);
  const tx = Math.cos(join.rot);
  const ty = Math.sin(join.rot);
  const run = join.x - startX;
  const chord = Math.hypot(run, join.y - ground);
  const flat = Math.min(FLAT_HANDLE * chord, run);
  const lead = Math.min(JOIN_HANDLE * chord, run / tx);
  return [
    { x: startX, y: ground },
    { x: startX + flat, y: ground },
    { x: join.x - lead * tx, y: join.y - lead * ty },
    { x: join.x, y: join.y },
  ];
}

export function cubicPath([a, b, c, d]: Cubic): string {
  const f = (p: Point) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  return `M${f(a)} C${f(b)} ${f(c)} ${f(d)}`;
}

export type Route = {
  /** Off-screen left, where he rides in from */
  startX: number;
  /** The top edge of the marquee strip */
  ground: number;
  /** Where the flat ends and the hill starts */
  hillX: number;
  hill: Curve;
  /** The hill as SVG path data */
  hillPath: string;
  ring: Ring;
};

export function buildRoute(measured: {
  /** Width of the ride layer, which is the viewport's */
  width: number;
  ground: number;
  ring: Ring;
  riderWidth: number;
}): Route {
  const { width, ground, ring, riderWidth } = measured;
  const hillX = hillStartX(width, ringPose(ring, JOIN), ground);
  const cubic = hillCubic(hillX, ground, ring);
  return {
    startX: -riderWidth,
    ground,
    hillX,
    hill: sampleCubic(cubic),
    hillPath: cubicPath(cubic),
    ring,
  };
}

// --- The ride ---

export const SPEED = 320; // px/s on the flat
const GRAVITY = 900; // px/s², once he's off the ring
const LAUNCH_BOOST = 1.5;

/**
 * "in" is the flat and then the hill, `along` px from the start. "loop" is laps of the ring.
 * "out" is the jump off the top of the ring, `time` seconds in. `travelled` is the whole
 * distance so far, which turns the wheels.
 */
export type Ride =
  | { mode: "in"; along: number; travelled: number; leaving: boolean }
  | { mode: "loop"; angle: number; travelled: number; leaving: boolean }
  | { mode: "out"; from: Point; vx: number; time: number; travelled: number };

export const startRide = (): Extract<Ride, { mode: "in" }> => ({
  mode: "in",
  along: 0,
  travelled: 0,
  leaving: false,
});

/** Clicks stop counting once he has been sent off. */
export const isLeaving = (ride: Ride): boolean =>
  ride.mode === "out" || ride.leaving;

/** The ride once the leave clicks land: he carries on to the top of the ring, then goes. */
export const sendOff = (ride: Ride): Ride =>
  ride.mode === "out" ? ride : { ...ride, leaving: true };

export function poseFor(ride: Ride, route: Route): Pose {
  if (ride.mode === "in") {
    const flat = route.hillX - route.startX;
    return ride.along < flat
      ? { x: route.startX + ride.along, y: route.ground, rot: 0 }
      : poseOnCurve(route.hill, ride.along - flat);
  }
  if (ride.mode === "loop") return ringPose(route.ring, ride.angle);
  const fall = GRAVITY * ride.time;
  return {
    x: ride.from.x + ride.vx * ride.time,
    y: ride.from.y + 0.5 * fall * ride.time,
    rot: Math.atan2(fall, ride.vx),
  };
}

/** Speed multiplier for a heading: slower uphill, faster downhill, between 0.55 and 1.45. */
export function paceFor(rot: number): number {
  return clamp(1 + 0.45 * Math.sin(rot), 0.55, 1.45);
}

/** The next time round that he reaches the top of the ring, at or after `angle`. */
export function nextExitAngle(angle: number): number {
  return TOP + Math.ceil((angle - TOP) / TURN) * TURN;
}

/** The ride `dt` seconds later. */
export function stepRide(
  ride: Ride,
  route: Route,
  dt: number,
  speed = SPEED,
): Ride {
  const ds = speed * paceFor(poseFor(ride, route).rot) * dt;
  const travelled = ride.travelled + ds;

  if (ride.mode === "in") {
    const along = ride.along + ds;
    const past = along - (route.hillX - route.startX) - route.hill.length;
    return past < 0
      ? { ...ride, along, travelled }
      : {
          mode: "loop",
          angle: JOIN + past / route.ring.r,
          travelled,
          leaving: ride.leaving,
        };
  }

  if (ride.mode === "loop") {
    const angle = ride.angle + ds / route.ring.r;
    return ride.leaving && angle >= nextExitAngle(ride.angle)
      ? {
          mode: "out",
          from: ringPose(route.ring, TOP),
          vx: speed * LAUNCH_BOOST,
          time: 0,
          travelled,
        }
      : { ...ride, angle, travelled };
  }

  return { ...ride, time: ride.time + dt, travelled };
}

const HILL_FADE_IN = 300; // px of flat before the climb
const HILL_FADE_OUT = Math.PI / 2; // a quarter lap

/** The dashed hill's opacity: it fades in as he nears it and out once he's on the ring. */
export function hillOpacity(ride: Ride, route: Route): number {
  if (ride.mode === "in") {
    const { x } = poseFor(ride, route);
    return clamp((x - (route.hillX - HILL_FADE_IN)) / HILL_FADE_IN, 0, 1);
  }
  if (ride.mode === "loop") {
    return clamp(1 - (ride.angle - JOIN) / HILL_FADE_OUT, 0, 1);
  }
  return 0;
}

/**
 * Whether he's out of sight: `margin` past the right edge, or about to pass `bottom` (the end
 * of the page, so the fall never makes the page longer).
 */
export function isGone(
  pose: Point,
  bounds: { width: number; bottom: number },
  margin: number,
): boolean {
  return pose.x - margin > bounds.width || pose.y + margin > bounds.bottom;
}
