// 和显卡打交道的几样小工具：让出主线程、等显卡把手上的活干完、认显卡、挑画质档。
// 核显上最要命的不是"慢"，而是"一口气干太久"：一次 draw 或一串排队的 draw 让显卡两秒不回话，
// Windows 就会重置显卡驱动（TDR），WebGL 上下文丢失，画面一黑到底。所以重活要切片，片与片之间等显卡喘口气。

/** 让浏览器喘一口气（消息，不是定时器：嵌套的定时器每次至少等 4 ms） */
export const turn = () =>
  new Promise((r) => {
    const c = new MessageChannel();
    c.port1.onmessage = () => r();
    c.port2.postMessage(0);
  });

/**
 * 等显卡把已经发过去的命令做完（fenceSync），期间主线程是空的：页面照常响应，显卡看门狗也不会觉得它死了。
 * 上下文丢了、或者等了 maxMs 还没完，也照样返回（不让启动卡死在这里）。
 */
export function gpuDone(renderer, maxMs = 30000) {
  const gl = renderer.getContext();
  if (!gl.fenceSync || gl.isContextLost()) return turn();
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  const t0 = performance.now();
  return new Promise((resolve) => {
    const poll = () => {
      let s = gl.TIMEOUT_EXPIRED;
      try {
        s = gl.isContextLost() ? gl.WAIT_FAILED : gl.clientWaitSync(sync, 0, 0);
      } catch {
        s = gl.WAIT_FAILED;
      }
      if (s === gl.TIMEOUT_EXPIRED && performance.now() - t0 < maxMs) return void setTimeout(poll, 4);
      try {
        gl.deleteSync(sync);
      } catch {}
      resolve();
    };
    // （同一个任务里问 fence 永远是"还没好"：先让出一轮）
    setTimeout(poll, 0);
  });
}

/**
 * 不动的东西，矩阵就不重算。three 每帧给场景里每个物体重新拼一遍本地矩阵、再乘一遍世界矩阵，
 * 六千多个物体就是两毫秒多的 CPU；这里把 updateMatrix 换成"位置/朝向/缩放和上次一样就跳过"的版本。
 * 会动的东西（车、风车、人）照常更新，不用谁来登记。
 */
const lazy = new WeakSet();
export function lazyMatrices(root) {
  root.traverse((o) => {
    if (lazy.has(o) || !o.matrixAutoUpdate) return;
    lazy.add(o);
    const base = o.updateMatrix;
    const p = o.position;
    const q = o.quaternion;
    const s = o.scale;
    let px, py, pz, qx, qy, qz, qw, sx, sy, sz;
    o.updateMatrix = function () {
      if (p.x === px && p.y === py && p.z === pz && q.x === qx && q.y === qy && q.z === qz && q.w === qw && s.x === sx && s.y === sy && s.z === sz) return;
      px = p.x;
      py = p.y;
      pz = p.z;
      qx = q.x;
      qy = q.y;
      qz = q.z;
      qw = q.w;
      sx = s.x;
      sy = s.y;
      sz = s.z;
      base.call(this);
    };
  });
}

/** 显卡的名字（ANGLE 的那一长串），认不出来就是空串 */
export function gpuName(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
  } catch {
    return '';
  }
}

/**
 * 按显卡名字和几项能力猜一个画质档：软件光栅/核显/手机 → low；独显 → high；认不出来 → medium。
 * @returns {{ quality: 'low'|'medium'|'high', kind: string, name: string, why: string }}
 */
export function guessQuality(gl, { dpr = 1, memory = undefined, pixels = 0 } = {}) {
  const name = gpuName(gl);
  const n = name.toLowerCase();
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  let kind = 'unknown';
  if (/swiftshader|llvmpipe|softpipe|software|microsoft basic|basic render/.test(n)) kind = 'software';
  else if (/mali|adreno|powervr|apple gpu|apple m\d|videocore|tegra/.test(n)) kind = /apple m\d/.test(n) ? 'apple' : 'mobile';
  // 独显在前：一台机器的字符串里既有 Intel 又有 NVIDIA 的时候，ANGLE 报的是真正在画的那块
  else if (/nvidia|geforce|rtx|gtx|quadro|radeon (rx|pro|r9)|radeon\(tm\) rx|arc\(tm\) [ab]\d|arc [ab]\d/.test(n)) kind = 'discrete';
  // 新一代的强核显（Arc 核显、Iris Xe Max、Radeon 680M/780M 这一级）：中档
  else if (/arc\(tm\)|intel\(r\) arc|xe max|radeon\(tm\) [6-9]\d0m|radeon [6-9]\d0m/.test(n)) kind = 'strong-integrated';
  else if (/intel|uhd|iris|hd graphics|radeon\(tm\) graphics|radeon graphics|vega|radeon r[2-7]|radeon hd|amd radeon\(tm\) \d/.test(n)) kind = 'integrated';
  let quality = kind === 'discrete' ? 'high' : kind === 'apple' || kind === 'unknown' || kind === 'strong-integrated' ? 'medium' : 'low';
  let why = kind;
  // 老独显/小显存也会报"独显"：贴图上限小的降一档
  if (maxTex < 8192) {
    quality = 'low';
    why += `，贴图上限 ${maxTex}`;
  } else if (quality === 'high' && maxTex < 16384) {
    quality = 'medium';
    why += `，贴图上限 ${maxTex}`;
  }
  // 内存小的机器（核显吃的就是内存）
  if (memory !== undefined && memory <= 4 && quality !== 'low') {
    quality = quality === 'high' ? 'medium' : 'low';
    why += `，内存 ${memory} GB`;
  }
  // 屏幕像素特别多（4K、高分屏）而不是独显：再保守一点
  if (quality === 'medium' && kind !== 'apple' && pixels * dpr * dpr > 2560 * 1440 * 1.2) {
    quality = 'low';
    why += '，屏幕像素多';
  }
  return { quality, kind, name, why };
}
