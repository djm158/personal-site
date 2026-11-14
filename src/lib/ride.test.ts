import { describe, expect, test } from "vitest";
import {
  JOIN,
  SPEED,
  TOP,
  buildRoute,
  countClick,
  crankTurn,
  cubicPoint,
  hillCubic,
  hillOpacity,
  hillStartX,
  hintFor,
  isGone,
  isLeaving,
  legFor,
  nextExitAngle,
  paceFor,
  pedalStroke,
  poseFor,
  poseOnCurve,
  riderCentre,
  riderWidthFor,
  ringPose,
  sampleCubic,
  sendOff,
  startRide,
  stepRide,
  wheelTurn,
  type Cubic,
  type Ride,
} from "./ride";

// The design's artboard: 1280 wide, marquee top at 480, a 162px ring centred on (1030, 250)
const ring = { cx: 1030, cy: 250, r: 162 };
const route = buildRoute({ width: 1280, ground: 480, ring, riderWidth: 112 });
const flat = route.hillX - route.startX;

/** Run the ride forward in 60fps steps until `done`, or fail after `limit` seconds. */
const rideUntil = (ride: Ride, done: (r: Ride) => boolean, limit = 30) => {
  let now = ride;
  for (let i = 0; i < limit * 60 && !done(now); i++) {
    now = stepRide(now, route, 1 / 60);
  }
  expect(done(now)).toBe(true);
  return now;
};

describe("countClick", () => {
  test("counts up without firing before the fifth click", () => {
    expect(countClick(0)).toEqual({ count: 1, fire: false });
    expect(countClick(3)).toEqual({ count: 4, fire: false });
  });

  test("the fifth click fires and starts the count again", () => {
    expect(countClick(4)).toEqual({ count: 0, fire: true });
  });

  test("ten clicks fire twice: once to start the ride, once to end it", () => {
    let count = 0;
    let fired = 0;
    for (let i = 0; i < 10; i++) {
      const next = countClick(count);
      count = next.count;
      if (next.fire) fired++;
    }
    expect(fired).toBe(2);
    expect(count).toBe(0);
  });
});

describe("hintFor", () => {
  const hints = ["one", "two", "three", "four"];

  test("no hint before the first click or after the fifth", () => {
    expect(hintFor(0, hints)).toBe("");
  });

  test("one hint per count, starting at the first click", () => {
    expect(hintFor(1, hints)).toBe("one");
    expect(hintFor(4, hints)).toBe("four");
  });

  test("a count past the end of the list has no hint", () => {
    expect(hintFor(2, ["one"])).toBe("");
    expect(hintFor(1, [])).toBe("");
  });
});

describe("riderWidthFor", () => {
  test("is 112px beside the design's ring, and no bigger beside a larger one", () => {
    expect(riderWidthFor(162, 200)).toBeCloseTo(112);
    expect(riderWidthFor(227, 200)).toBe(112);
  });

  test("shrinks with a smaller ring", () => {
    expect(riderWidthFor(130, 200)).toBeCloseTo(89.9, 1);
  });

  test("shrinks to fit the space above the ring, down to 64px", () => {
    // he stands 0.589 of his width tall, so 50px of headroom fits a rider about 85px wide
    expect(riderWidthFor(162, 50)).toBeCloseTo(84.8, 1);
    expect(riderWidthFor(162, 10)).toBe(64);
  });
});

describe("riderCentre", () => {
  // at 112px wide the middle of him is 35px from the ground
  test("is above the wheels on the flat", () => {
    const centre = riderCentre({ x: 100, y: 480, rot: 0 }, 112);
    expect(centre.x).toBeCloseTo(100);
    expect(centre.y).toBeCloseTo(445);
  });

  test("is outside the ring all the way round", () => {
    const right = riderCentre(ringPose(ring, 0), 112);
    expect(right.x).toBeCloseTo(1030 + 162 + 35);
    expect(right.y).toBeCloseTo(250);
    const bottom = riderCentre(ringPose(ring, Math.PI / 2), 112);
    expect(bottom.x).toBeCloseTo(1030);
    expect(bottom.y).toBeCloseTo(250 + 162 + 35);
  });
});

describe("wheels and cranks", () => {
  test("a wheel turns once per circumference travelled", () => {
    // at 112px wide the 21-unit wheel is 14.7px in radius
    expect(wheelTurn(2 * Math.PI * 14.7, 112)).toBeCloseTo(2 * Math.PI);
    // a smaller rider's wheels turn faster over the same ground
    expect(wheelTurn(100, 80)).toBeCloseTo(wheelTurn(100, 112) * 1.4);
  });

  test("the cranks turn 2.2 times slower than the wheels", () => {
    expect(crankTurn(2.2)).toBeCloseTo(1);
  });
});

describe("legFor", () => {
  const hip = { x: 46, y: 37 };
  const length = (a: { x: number; y: number }, b: typeof a) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  test.each([0, 180, 270])(
    "at crank %i° the foot is on the pedal and both bones are 21 long",
    (degrees) => {
      const crank = (degrees * Math.PI) / 180;
      const { knee, foot } = legFor(crank);
      expect(foot.x).toBeCloseTo(54 + 9 * Math.cos(crank));
      expect(foot.y).toBeCloseTo(71 + 9 * Math.sin(crank));
      expect(length(hip, knee)).toBeCloseTo(21);
      expect(length(knee, foot)).toBeCloseTo(21);
    },
  );

  test("at the bottom of the stroke the pedal is out of reach, so the leg is straight and the shin is drawn long, as in the design", () => {
    const { knee, foot } = legFor(Math.PI / 2);
    expect(foot.x).toBeCloseTo(54);
    expect(foot.y).toBeCloseTo(80);
    expect(length(hip, knee)).toBeCloseTo(21);
    expect(length(knee, foot)).toBeCloseTo(22.75, 1);
  });

  test("the knee bends forwards, ahead of the line from hip to foot", () => {
    for (const crank of [0, 1, 2, 3, 4, 5, 6]) {
      const { knee, foot } = legFor(crank);
      // cross product of hip→foot and hip→knee: negative is the forward (right-hand) side
      const cross =
        (foot.x - hip.x) * (knee.y - hip.y) -
        (foot.y - hip.y) * (knee.x - hip.x);
      expect(cross).toBeLessThan(0);
    }
  });
});

describe("pedalStroke", () => {
  test("draws the near leg to its pedal and the far leg to the opposite one", () => {
    const stroke = pedalStroke(0);
    expect(stroke.near.shin.endsWith("L63.00 71.00")).toBe(true);
    expect(stroke.far.shin.endsWith("L45.00 71.00")).toBe(true);
    expect(stroke.crank).toBe("M45.00 71.00 L63.00 71.00");
    expect(stroke.near.thigh.startsWith("M46.00 37.00 L")).toBe(true);
    expect(stroke.near.shoe).toBe("M60.50 72.00 L68.00 72.00");
  });
});

describe("ringPose", () => {
  test("is upright at the top and upside down at the bottom", () => {
    const top = ringPose(ring, TOP);
    expect(top.x).toBeCloseTo(1030);
    expect(top.y).toBeCloseTo(88);
    expect(top.rot).toBeCloseTo(0);

    const bottom = ringPose(ring, Math.PI / 2);
    expect(bottom.y).toBeCloseTo(412);
    expect(bottom.rot).toBeCloseTo(Math.PI);
  });

  test("heads straight down at 3 o'clock, so the lap is clockwise", () => {
    const right = ringPose(ring, 0);
    expect(right.x).toBeCloseTo(1192);
    expect(right.rot).toBeCloseTo(Math.PI / 2);
  });
});

describe("the curve helpers", () => {
  // a straight line drawn as a cubic, 300 long
  const line: Cubic = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 200, y: 0 },
    { x: 300, y: 0 },
  ];

  test("cubicPoint starts and ends on the end points", () => {
    expect(cubicPoint(line, 0)).toEqual({ x: 0, y: 0 });
    expect(cubicPoint(line, 1)).toEqual({ x: 300, y: 0 });
    expect(cubicPoint(line, 0.5).x).toBeCloseTo(150);
  });

  test("sampleCubic measures the length", () => {
    expect(sampleCubic(line).length).toBeCloseTo(300);
    // a quarter circle of radius 100, as the usual cubic approximation
    const k = 55.2285;
    const arc: Cubic = [
      { x: 100, y: 0 },
      { x: 100, y: k },
      { x: k, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(sampleCubic(arc).length).toBeCloseTo((Math.PI * 100) / 2, 0);
  });

  test("poseOnCurve finds the point at a distance, and stops at the ends", () => {
    const curve = sampleCubic(line);
    expect(poseOnCurve(curve, 120).x).toBeCloseTo(120);
    expect(poseOnCurve(curve, 120).rot).toBeCloseTo(0);
    expect(poseOnCurve(curve, -5).x).toBeCloseTo(0);
    expect(poseOnCurve(curve, 999).x).toBeCloseTo(300);
  });
});

describe("hillStartX", () => {
  test("is the middle of the viewport in the design's layout", () => {
    expect(hillStartX(1280, ringPose(ring, JOIN), 480)).toBeCloseTo(640, 0);
  });

  test("is the middle when a small, low ring would allow a later start", () => {
    expect(hillStartX(1280, { x: 978, y: 300 }, 600)).toBe(640);
  });

  test("moves left to keep the design's slope under a bigger, higher ring", () => {
    // 1400 wide with a 420px avatar: the join is 515px above the marquee
    expect(hillStartX(1400, { x: 902, y: 148 }, 663)).toBeCloseTo(490);
  });

  test("stops at the left edge when the join is close to it", () => {
    const join = { x: 243, y: 100 };
    expect(hillStartX(760, join, 900)).toBe(16);
  });

  test("stays left of the join whatever happens", () => {
    expect(hillStartX(760, { x: 10, y: 100 }, 900)).toBe(9);
  });
});

describe("hillCubic", () => {
  test("matches the design's hill", () => {
    const [start, flatHandle, joinHandle, end] = hillCubic(640, 480, ring);
    expect(start).toEqual({ x: 640, y: 480 });
    // 150px along the ground
    expect(flatHandle.x).toBeCloseTo(790, 0);
    expect(flatHandle.y).toBe(480);
    // 130px back from the join, down its tangent
    expect(joinHandle.x).toBeCloseTo(823.5, 0);
    expect(joinHandle.y).toBeCloseTo(227.5, 0);
    expect(end.x).toBeCloseTo(915.4, 0);
    expect(end.y).toBeCloseTo(135.4, 0);
  });

  test("starts level and ends on the ring's tangent", () => {
    const hill = sampleCubic(hillCubic(640, 480, ring));
    expect(poseOnCurve(hill, 0).rot).toBeCloseTo(0, 1);
    expect(poseOnCurve(hill, hill.length).rot).toBeCloseTo(
      ringPose(ring, JOIN).rot,
      1,
    );
  });

  test("a tall, narrow hill never doubles back", () => {
    const highAndLeft = { cx: 380, cy: 240, r: 194 };
    const { samples } = sampleCubic(hillCubic(16, 900, highAndLeft));
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].x).toBeGreaterThanOrEqual(samples[i - 1].x);
      expect(samples[i].y).toBeLessThanOrEqual(samples[i - 1].y);
    }
  });
});

describe("paceFor", () => {
  test("is 1 on the flat", () => {
    expect(paceFor(0)).toBe(1);
  });

  test("is slower uphill and faster downhill, within 0.55–1.45", () => {
    expect(paceFor(-Math.PI / 6)).toBeCloseTo(0.775);
    expect(paceFor(Math.PI / 6)).toBeCloseTo(1.225);
    expect(paceFor(-Math.PI / 2)).toBeCloseTo(0.55);
    expect(paceFor(Math.PI / 2)).toBeCloseTo(1.45);
  });
});

describe("nextExitAngle", () => {
  test("is the top of the ring on this lap if it's still ahead", () => {
    expect(nextExitAngle(JOIN)).toBeCloseTo(TOP);
    expect(nextExitAngle(TOP)).toBeCloseTo(TOP);
  });

  test("is the top on the next lap once he's past it", () => {
    expect(nextExitAngle(0)).toBeCloseTo(TOP + 2 * Math.PI);
    expect(nextExitAngle(TOP + 7)).toBeCloseTo(TOP + 4 * Math.PI);
  });
});

describe("poseFor", () => {
  test("starts off-screen on the marquee's top edge", () => {
    expect(poseFor(startRide(), route)).toEqual({ x: -112, y: 480, rot: 0 });
  });

  test("is on the hill once past the flat", () => {
    const pose = poseFor({ ...startRide(), along: flat + 200 }, route);
    expect(pose.x).toBeGreaterThan(640);
    expect(pose.y).toBeLessThan(480);
    expect(pose.rot).toBeLessThan(0);
  });

  test("falls in an arc after the launch, nose turning down", () => {
    const from = { x: 1030, y: 88 };
    const out = { mode: "out", from, vx: 480, travelled: 0 } as const;
    expect(poseFor({ ...out, time: 0 }, route)).toEqual({ ...from, rot: 0 });
    const later = poseFor({ ...out, time: 0.5 }, route);
    expect(later.x).toBeCloseTo(1270);
    expect(later.y).toBeCloseTo(88 + 112.5);
    expect(later.rot).toBeCloseTo(Math.atan2(450, 480));
  });
});

describe("stepRide", () => {
  test("rides the flat at 320px/s", () => {
    const next = stepRide(startRide(), route, 0.5);
    expect(next).toMatchObject({ mode: "in", along: 160, travelled: 160 });
    expect(SPEED).toBe(320);
  });

  test("climbs slower than it rides the flat", () => {
    const onHill: Ride = { ...startRide(), along: flat + 250 };
    const next = stepRide(onHill, route, 0.1);
    expect(next.mode).toBe("in");
    expect(next.travelled).toBeLessThan(32);
  });

  test("joins the ring at 10:30 and keeps lapping until told to leave", () => {
    const joined = rideUntil(startRide(), (r) => r.mode === "loop");
    expect(joined.mode === "loop" && joined.angle).toBeCloseTo(JOIN, 1);

    // three laps later he's still there
    const lapped = rideUntil(
      joined,
      (r) => r.mode === "loop" && r.angle > JOIN + 6 * Math.PI,
    );
    expect(lapped.mode).toBe("loop");
  });

  test("once leaving, jumps off the top of the ring at 1.5× speed", () => {
    const leaving: Ride = {
      mode: "loop",
      angle: 1,
      travelled: 0,
      leaving: true,
    };
    const out = rideUntil(leaving, (r) => r.mode === "out");
    expect(out).toMatchObject({ mode: "out", vx: 480, time: 0 });
    expect(out.mode === "out" && out.from.x).toBeCloseTo(1030);
    expect(out.mode === "out" && out.from.y).toBeCloseTo(88);
    // the rest of the lap from angle 1 to the top, not a full extra one
    expect(out.travelled).toBeCloseTo((TOP + 2 * Math.PI - 1) * 162, -1);
  });

  test("told to leave on the way in, he still goes up and off at the first top", () => {
    const out = rideUntil(
      { ...startRide(), leaving: true },
      (r) => r.mode === "out",
    );
    expect(out.travelled).toBeLessThan(
      flat + route.hill.length + (TOP - JOIN) * 162 + 10,
    );
  });

  test("keeps the wheels turning and the clock running in the air", () => {
    const out: Ride = {
      mode: "out",
      from: { x: 1030, y: 88 },
      vx: 480,
      time: 0,
      travelled: 0,
    };
    const next = stepRide(out, route, 0.1);
    expect(next).toMatchObject({ mode: "out", time: 0.1 });
    expect(next.travelled).toBeGreaterThan(0);
  });
});

describe("isLeaving", () => {
  test("is false while he's riding in or lapping, until he's sent off", () => {
    expect(isLeaving(startRide())).toBe(false);
    expect(isLeaving({ ...startRide(), leaving: true })).toBe(true);
    expect(
      isLeaving({
        mode: "out",
        from: { x: 0, y: 0 },
        vx: 480,
        time: 0,
        travelled: 0,
      }),
    ).toBe(true);
  });
});

describe("sendOff", () => {
  test("marks a ride as leaving, on the way in or on the ring", () => {
    expect(sendOff(startRide())).toMatchObject({ mode: "in", leaving: true });
    const lapping: Ride = {
      mode: "loop",
      angle: 1,
      travelled: 0,
      leaving: false,
    };
    expect(sendOff(lapping)).toEqual({ ...lapping, leaving: true });
  });
});

describe("hillOpacity", () => {
  test("fades in over the 300px before the climb", () => {
    const at = (x: number) =>
      hillOpacity({ ...startRide(), along: x - route.startX }, route);
    expect(at(300)).toBe(0);
    expect(at(490)).toBeCloseTo(0.5);
    expect(at(640)).toBe(1);
    expect(hillOpacity({ ...startRide(), along: flat + 100 }, route)).toBe(1);
  });

  test("fades out over the first quarter lap", () => {
    const at = (angle: number) =>
      hillOpacity({ mode: "loop", angle, travelled: 0, leaving: false }, route);
    expect(at(JOIN)).toBe(1);
    expect(at(JOIN + Math.PI / 4)).toBeCloseTo(0.5);
    expect(at(JOIN + Math.PI / 2)).toBe(0);
    expect(at(JOIN + 9)).toBe(0);
  });
});

describe("isGone", () => {
  const bounds = { width: 1280, bottom: 3000 };

  test("is gone once he's fully past the right edge", () => {
    expect(isGone({ x: 1300, y: 300 }, bounds, 112)).toBe(false);
    expect(isGone({ x: 1400, y: 300 }, bounds, 112)).toBe(true);
  });

  test("is gone before he would fall past the end of the page", () => {
    expect(isGone({ x: 900, y: 2800 }, bounds, 112)).toBe(false);
    expect(isGone({ x: 900, y: 2900 }, bounds, 112)).toBe(true);
  });
});
