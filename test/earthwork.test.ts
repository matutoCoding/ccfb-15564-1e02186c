import test from 'node:test';
import assert from 'node:assert/strict';
import { triangleCutFill, computeEarthwork } from '../src/lib/earthwork.ts';
import { createTerrainGrid } from '../src/lib/terrain.ts';

test('triangleCutFill 全挖方等于面积乘平均深度', () => {
  const v = triangleCutFill(2, 1, 2, 3);
  assert.ok(Math.abs(v.cut - 4) < 1e-10);
  assert.equal(v.fill, 0);
});

test('triangleCutFill 一个正角时按零值交线切成小三角', () => {
  const v = triangleCutFill(0.5, 3, 0, 0);
  assert.ok(Math.abs(v.cut - 0.5) < 1e-9);
  assert.equal(v.fill, 0);
});

test('computeEarthwork 对 2x2 网格积分', () => {
  const terrain = createTerrainGrid('t', 2, 2, 1, 1, new Float32Array([0, 0, 0, 0]), 'generated', 0, 0);
  const designed = new Float32Array([-1, -1, -1, -1]);
  const report = computeEarthwork(terrain, designed);
  assert.ok(Math.abs(report.totalCut - 1) < 1e-8);
  assert.ok(report.totalFill < 1e-8);
});
