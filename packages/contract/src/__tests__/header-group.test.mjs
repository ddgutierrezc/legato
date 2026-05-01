import test from 'node:test';
import assert from 'node:assert/strict';
import * as contract from '../../../contract/dist/index.js';

test('TRACK_TYPES is a readonly tuple of supported track type strings', () => {
  assert.deepEqual(contract.TRACK_TYPES, ['file', 'progressive', 'hls', 'dash']);
});

test('TRACK_TYPES contains unique values only', () => {
  const unique = new Set(contract.TRACK_TYPES);
  assert.equal(unique.size, contract.TRACK_TYPES.length);
});

test('TRACK_TYPES can be used as a strict runtime allow-list', () => {
  const isSupportedTrackType = (value) => contract.TRACK_TYPES.includes(value);

  assert.equal(isSupportedTrackType('file'), true);
  assert.equal(isSupportedTrackType('progressive'), true);
  assert.equal(isSupportedTrackType('hls'), true);
  assert.equal(isSupportedTrackType('dash'), true);

  assert.equal(isSupportedTrackType('mp3'), false);
  assert.equal(isSupportedTrackType('stream'), false);
  assert.equal(isSupportedTrackType(''), false);
});

test('TRACK_TYPES iteration order is deterministic for UI/listing use cases', () => {
  const labels = contract.TRACK_TYPES.map((type) => type.toUpperCase());
  assert.deepEqual(labels, ['FILE', 'PROGRESSIVE', 'HLS', 'DASH']);
});

test('TRACK_TYPES consumer copy can be safely extended without mutating source', () => {
  const consumerCopy = [...contract.TRACK_TYPES, 'custom'];

  assert.deepEqual(consumerCopy, ['file', 'progressive', 'hls', 'dash', 'custom']);
  assert.deepEqual(contract.TRACK_TYPES, ['file', 'progressive', 'hls', 'dash']);
});
