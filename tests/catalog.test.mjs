import test from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES, PLANTS, ANIMALS, NATURE, KINDS, ofKind, STARTERS, HABITATS, speciesById, inSeason, seasonText, goalText, BREEDS, BREED_IDS, artOf } from '../src/catalog.js';
import { ART } from '../src/art.js';

test('the catalogue is consistent', () => {
  assert.equal(new Set(SPECIES.map(s => s.id)).size, SPECIES.length, 'ids are unique');
  assert.equal(new Set(SPECIES.map(s => s.name)).size, SPECIES.length, 'names are unique');
  assert.ok(PLANTS.length >= 20 && ANIMALS.length >= 20 && NATURE.length >= 8, 'a real variety of each');
  assert.equal(PLANTS.length + ANIMALS.length + NATURE.length, SPECIES.length, 'everything is a plant, an animal or nature');
  assert.deepEqual(KINDS.map(k => k[0]), ['plant', 'animal', 'nature']);
  assert.equal(ofKind('nature'), NATURE);
  for (const n of NATURE) assert.ok(n.minMinutes >= 10 && n.minMinutes <= 60 && n.price > 0, `${n.id} takes real time`);
  for (const s of SPECIES) {
    assert.match(s.id, /^[a-z]+$/);
    assert.ok(HABITATS[s.habitat], `${s.id} has a known habitat`);
    assert.ok(Number.isInteger(s.price) && s.price >= 0, `${s.id} has a price`);
    assert.ok(s.blurb.length > 10 && s.blurb.length <= 70 && s.blurb.endsWith('.'), `${s.id} blurb`);
    if (s.season) assert.ok(s.season.every(m => m >= 1 && m <= 12) && s.price > 0);
    if (s.goal) assert.ok(goalText(s.goal) && s.goal.n > 0 && s.price > 0, `${s.id} goal`);
  }
});

test('there is a plant and an animal to start with', () => {
  assert.ok(STARTERS.some(id => speciesById(id).kind === 'plant'));
  assert.ok(STARTERS.some(id => speciesById(id).kind === 'animal'));
});

test('seasons', () => {
  const snow = speciesById('frostpine');
  assert.equal(inSeason(snow, 1), true);
  assert.equal(inSeason(snow, 12), true);
  assert.equal(inSeason(snow, 6), false);
  assert.equal(seasonText(snow), 'December to February');
  assert.equal(seasonText(speciesById('clover')), '');
  assert.equal(inSeason(speciesById('clover'), 5), false);
});

test('every species has art, and no art is left over', () => {
  for (const s of SPECIES) assert.equal(typeof ART[s.id], 'function', `${s.id} has art`);
  for (const id of Object.keys(ART)) {
    const [species, breed] = id.split(':');
    assert.ok(speciesById(species), `${id} is in the catalogue`);
    if (breed) assert.ok(BREED_IDS.includes(breed), `${id} is a known breed`);
  }
  for (const [breed] of BREEDS) assert.equal(typeof ART[artOf('dog', breed)], 'function', `the ${breed} dog has art`);
});

test('the shiba became a dog, and old ids still work', () => {
  assert.equal(speciesById('shiba').id, 'dog');
  assert.equal(artOf('shiba'), 'dog:shiba');
  assert.equal(artOf('dog', 'mixed'), 'dog');
  assert.equal(artOf('dog', 'corgi'), 'dog:corgi');
  assert.equal(artOf('dog', 'unicorn'), 'dog');
  assert.equal(artOf('rabbit', 'corgi'), 'rabbit');
});
