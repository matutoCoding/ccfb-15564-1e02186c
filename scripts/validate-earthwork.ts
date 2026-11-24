import { validateEarthwork } from '../src/lib/validation.ts';

const report = validateEarthwork(1);
console.log('挖填方解析地形核对（阈值 < 1%）');
console.table(report.cases.map((c) => ({
  场景: c.name,
  挖方误差: `${c.cutErrorPct.toFixed(4)}%`,
  填方误差: `${c.fillErrorPct.toFixed(4)}%`,
  平衡偏差: `${c.balancePct.toFixed(4)}%`,
  净方差: `${c.netErrorPct.toFixed(4)}%`,
  结论: c.passed ? 'PASS' : 'FAIL'
})));

if (!report.allPassed) {
  process.exitCode = 1;
  console.error('核对未通过');
} else {
  console.log('全部通过：斜面与圆锥面误差均小于 1%');
}
