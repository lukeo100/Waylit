/**
 * Reference figures for the Segway Ninebot KickScooter MAX G3, used by the mock adapter.
 *
 * Source: the manufacturer's Asia Pacific product page for the MAX G3,
 * https://ap-en.segway.com/product/maxg3.html (read 2026-11-22). Figures taken from it:
 *   - battery 597 Wh nominal, 46.8 V
 *   - maximum range 80 km in Eco mode (15 km/h) and 65 km in Sport mode (25 km/h), measured
 *     by the maker in ideal conditions
 *   - top speed about 25 km/h on that page, and the unit is described as limited to 25 km/h in
 *     Australia by an independent review at
 *     https://www.gadgetguy.com.au/max-g3-segway-electric-kickscooter
 *   - motor 850 W nominal and 2000 W peak
 *   - weight about 24.3 kg, maximum rider load 130 kg
 *   - riding modes Eco and Sport
 * Other regions advertise a higher top speed, so the limit here is a setting, not a spec.
 * The independent review at https://eridehero.com/products/segway-ninebot-max-g3/ measured
 * roughly 15 Wh per km in regular riding, which is why the mock applies a real-world factor
 * to the maker's ideal figures. Treat these as plausible mock values, not as a guarantee.
 *
 * Waylit is not affiliated with Segway-Ninebot. The names are used only to describe which
 * vehicle the mock imitates.
 */
export const NINEBOT_MAX_G3 = {
  displayName: "Ninebot MAX G3 (simulated)",
  batteryCapacityWh: 597,
  /** Maker's range figures in ideal conditions, as speed in km/h and range in km. */
  claimedRange: [
    { speedKmh: 15, rangeKm: 80 },
    { speedKmh: 25, rangeKm: 65 },
  ],
  nominalMotorWatts: 850,
  peakMotorWatts: 2000,
} as const;

/** Default speed limit for the mock, in km/h. A common legal limit for shared paths and roads. */
export const DEFAULT_SPEED_LIMIT_KMH = 25;
