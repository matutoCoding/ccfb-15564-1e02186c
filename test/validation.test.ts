import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEarthwork } from '../src/lib/validation.ts';

test('解析斜面和圆锥面挖填方误差小于 1%', { timeout: 120000 }, () => {
  const report = validateEarthwork(1);
  const failures = report.cases.filter((c) => !c.passed);
  assert.equal(failures.length, 0, failures.map((f) => `${f.name}: cut=${f.cutErrorPct} fill=${f.fillErrorPct} net=${f.netErrorPct}`).join('\n'));
});
