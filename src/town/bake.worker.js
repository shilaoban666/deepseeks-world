// 小鲸鱼的世界：地面烘焙放到别的线程。
// 一百万个点各算一次 heightAt 和 paint 要三四秒；放在页面线程上，这三四秒里显卡在干等、页面也不动。
// 这里按"几行一条"干活：main.js 开几个 worker，谁闲了就领下一条，结果和页面线程自己算的一模一样（都是纯函数）。
import { bakeRows } from '../lib/bake.js';
import { heightAt, paint } from './plan.js';

self.onmessage = ({ data }) => {
  const { extent, extentRes, centre, from, to } = data;
  const rows = to - from;
  const texel = extent / extentRes;
  const heights = new Float32Array(rows * extentRes);
  const map = new Uint8Array(rows * extentRes * 4);
  // （把起点挪到第 from 行，就能往一块只有 rows 行的小数组里写）
  bakeRows({ heightAt, paint, extentMin: [centre[0] - extent / 2, centre[1] - extent / 2 + from * texel], texel, extentRes }, heights, map, 0, rows);
  self.postMessage({ from, to, heights, map }, [heights.buffer, map.buffer]);
};
