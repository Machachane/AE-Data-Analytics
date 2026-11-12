import { test } from "node:test";
import assert from "node:assert/strict";
import { countryLabels, countryLabelOpacity } from "./map-country-labels.ts";

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
  assert.deepEqual(countryLabels({ features: [] }, rows), [{ name: "Zero", latitude: 0, longitude: 0, rank: 7, alpha3: "ZER" }]);
});

test("labels progressively fade in, then fade out as users zoom back", () => {
  assert.equal(countryLabelOpacity(2, 2.5), 1);
  assert.equal(countryLabelOpacity(5, 2.5), 0);
  assert.equal(countryLabelOpacity(5, 4), 0);
  assert.equal(countryLabelOpacity(5, 4.5), 0.5);
  assert.equal(countryLabelOpacity(5, 5), 1);
  assert.equal(countryLabelOpacity(5, 4.25), 0.25);
  for (let rank = 2; rank <= 7; rank++) {
    let previous = 0;
    for (let zoom = 0; zoom <= 8; zoom += 0.25) {
      const opacity = countryLabelOpacity(rank, zoom);
      assert.ok(opacity >= previous && opacity <= 1);
      previous = opacity;
    }
    assert.equal(countryLabelOpacity(rank, 8), 1, "every country is visible at the closest zoom");
  }
});

test("source-only countries remain available at closer zoom levels", () => {
  const [label] = countryLabels({ features: [] }, [
    { country: "Singapore", alpha3: "SGP", latitude: 1.35, longitude: 103.82 },
  ]);
  assert.equal(countryLabelOpacity(label.rank, 2.5), 0);
  assert.equal(countryLabelOpacity(label.rank, 6.5), 0.5);
  assert.equal(countryLabelOpacity(label.rank, 8), 1);
});
