/** Arcade flight director. Distances are nautical miles and heights are feet. */
export const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
export const angleDifference = (target: number, current: number) =>
  ((target - current + 540) % 360) - 180;
export const glideAltitude = (distance: number) =>
  Math.max(0, distance * 318 + 35);
export function interceptHeading(crossTrack: number, distance: number) {
  return (
    270 -
    clamp(
      (Math.atan2(crossTrack, Math.max(0.4, distance * 0.4)) * 180) / Math.PI,
      -25,
      25,
    )
  );
}
export function flightDirector(a: {
  crossTrack: number;
  distance: number;
  heading: number;
  altitude: number;
  speed: number;
}) {
  const flare = a.distance < 0.32 && a.altitude < 50;
  return {
    flare,
    bank: clamp(
      angleDifference(interceptHeading(a.crossTrack, a.distance), a.heading) *
        1.8,
      -20,
      20,
    ),
    descent: flare
      ? -240
      : clamp(
          (-a.speed / 60) * 318 +
            (glideAltitude(a.distance) - a.altitude) * 2.2,
          -1800,
          300,
        ),
  };
}
