/**
 * Mock weather for the HUD chip. Milestone 1 makes no network calls for weather, so this is a
 * fixed placeholder. A later phase can replace it with a real source behind the same shape.
 */
export interface WeatherReading {
  readonly label: string;
  readonly temperatureCelsius: number;
}

export const MOCK_WEATHER: WeatherReading = { label: "Partly cloudy", temperatureCelsius: 19 };
