/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fitTilt, project, unproject } from './tilt.ts';

const size = { w: 393, h: 700 };
const tilt = fitTilt(size, 14, 900);
const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('unproject undoes project anywhere on the table', () => {
  for (const [x, y] of [
    [0, 0],
    [393, 0],
    [196, 350],
    [50, 650],
    [393, 700],
    [120, 30],
  ]) {
    const screen = project(x, y, size, tilt);
    const back = unproject(screen.x, screen.y, size, tilt);
    close(back.x, x);
    close(back.y, y);
  }
});

test('the far edge looks smaller than the near edge, and the near edge just fits', () => {
  const farLeft = project(0, 0, size, tilt);
  const farRight = project(size.w, 0, size, tilt);
  const nearLeft = project(0, size.h, size, tilt);
  const nearRight = project(size.w, size.h, size, tilt);
  assert.ok(farRight.x - farLeft.x < nearRight.x - nearLeft.x);
  close(nearRight.x - nearLeft.x, size.w);
});

test('the centre stays put, and a flat table maps straight through', () => {
  const c = project(size.w / 2, size.h / 2, size, tilt);
  close(c.x, size.w / 2);
  close(c.y, size.h / 2);
  const flat = fitTilt(size, 0, 900);
  const p = unproject(10, 20, size, flat);
  close(p.x, 10);
  close(p.y, 20);
});
