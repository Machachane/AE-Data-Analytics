import { test } from "node:test";
import assert from "node:assert/strict";
import { countryLabels } from "./map-country-labels.ts";

test("labels all geography ranks, including smaller countries", () => {
  const labels = countryLabels({ features: [2, 3, 4, 5, 6, 7].map((rank) => ({
    properties: { NAME_EN: `Country ${rank}`, LABELRANK: rank, LABEL_X: rank, LABEL_Y: rank },
  })) }, []);
  assert.equal(labels.length, 6);
});

test("adds source-only countries without duplicating aliases or repeated rows", () => {
  const geography = { features: [{ properties: { NAME_EN: "Albania", ADM0_A3: "ALB", LABEL_X: 20, LABEL_Y: 41 } }] };
  const rows = [
    { country: "Albania (All Albanian Territories)", alpha3: "ALB", latitude: 41, longitude: 20 },
    { country: "Singapore", alpha3: "SGP", latitude: 1.35, longitude: 103.82 },
    { country: "Singapore", alpha3: "SGP", latitude: 1.35, longitude: 103.82 },
    { country: "No coordinates", alpha3: "", latitude: null, longitude: null },
  ];
  assert.deepEqual(countryLabels(geography, rows).map((label) => label.name), ["Albania", "Singapore"]);
});

test("rejects invalid labels and coordinates without dropping valid zero coordinates", () => {
  const rows = [
    { country: "Zero", alpha3: "ZER", latitude: 0, longitude: 0 },
    { country: "Invalid", alpha3: "", latitude: NaN, longitude: 10 },
    { country: "Outside", alpha3: "", latitude: 91, longitude: 10 },
    { country: " ", alpha3: "", latitude: 10, longitude: 10 },
  ];
  assert.deepEqual(countryLabels({ features: [] }, rows), [{ name: "Zero", latitude: 0, longitude: 0 }]);
});
