/* ---------------- 云同步（Cloudflare Worker + D1） ---------------- */
// 整包同步：数据与 .lexicon 备份文件同格式；localStorage 始终留一份缓存，没网照常
// 使用，联网后自动合并（并集）推送。口令第一次输入后记住。
// 服务器端见 cloud/worker.js；具体编排（何时拉、何时推）在 app.js 的 bootCloud。
(() => {
  const KEY_URL = "yueword-cloud-url";
  const KEY_KEY = "yueword-cloud-key";
  const KEY_REV = "yueword-cloud-rev";
  // 部署 Worker 后把这里填上，例如 "https://yueword-cloud.abc123.workers.dev"
  // 注意用自定义域名（workers.dev 在国内被 DNS 污染）
  const DEFAULT_URL = "https://yueword.flowfx.net";

  // 测试用：页面地址加 ?cloud=http://127.0.0.1:8787 可临时指定云端地址
  try {
    const override = new URLSearchParams(location.search).get("cloud");
    if (override) localStorage.setItem(KEY_URL, override.replace(/\/+$/, ""));
  } catch (_) { /* node 测试环境没有 location */ }

  const endpoint = () => String(localStorage.getItem(KEY_URL) || DEFAULT_URL || "").replace(/\/+$/, "");
  const getKey = () => localStorage.getItem(KEY_KEY) || "";
  const configured = () => !!(endpoint() && getKey());
  const localRev = () => Number(localStorage.getItem(KEY_REV)) || 0;
  const setRev = (rev) => localStorage.setItem(KEY_REV, String(rev || 0));

  let pushTimer = null;
  let pendingGet = null;

  async function api(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(endpoint() + path, {
        ...options,
        signal: controller.signal,
        headers: { "content-type": "application/json", "x-family-key": getKey(), ...(options.headers || {}) },
      });
      const body = await res.json().catch(() => ({}));
      return { status: res.status, body };
    } finally {
      clearTimeout(timer);
    }
  }

  // 拉取云端数据；返回 {rev, data}，失败返回 null 并把原因写进状态条。
  async function fetchData() {
    try {
      const { status, body } = await api("/api/data");
      if (status === 200) return body;
      setStatus(status === 401 ? "口令不对，请重新输入" : "云端返回 " + status);
      return null;
    } catch (_) {
      setStatus("离线模式（连不上云端），照常可用");
      return null;
    }
  }

  // 推送整包；409 冲突时用 merge（由 app.js 注入）求并集后重推一次。
  async function pushData(data, merge) {
    const mergeFn = merge || YueWordCloud.merge;
    let { status, body } = await api("/api/data", {
      method: "PUT",
      body: JSON.stringify({ base_rev: localRev(), data }),
    });
    if (status === 200) { setRev(body.rev); return { ok: true, rev: body.rev }; }
    if (status === 409) {
      const remote = await api("/api/data");
      if (remote.status !== 200) return { ok: false, error: "network" };
      const merged = mergeFn ? mergeFn(remote.body.data, data) : data;
      const retry = await api("/api/data", {
        method: "PUT",
        body: JSON.stringify({ base_rev: remote.body.rev, data: merged }),
      });
      if (retry.status === 200) {
        setRev(retry.body.rev);
        return { ok: true, rev: retry.body.rev, merged };
      }
      return { ok: false, error: "conflict" };
    }
    if (status === 401) return { ok: false, error: "口令不对" };
    return { ok: false, error: "http " + status };
  }

  // 防抖推送：save() 里高频调用，2 秒内的多次保存合成一次上传。
  function queuePush(getData) {
    if (!configured()) return;
    pendingGet = getData;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(runPending, 2000);
  }

  async function runPending() {
    const get = pendingGet;
    pendingGet = null;
    pushTimer = null;
    if (!get) return;
    const result = await pushData(get());
    if (!result.ok) setStatus("云同步失败：" + result.error + "（本地已保存，联网后会自动合并）");
    else if (result.merged && YueWordCloud.onMerged) YueWordCloud.onMerged(result.merged);
  }

  // 关页/切后台前把还没上传的改动立刻推出去
  function flushNow() {
    if (pushTimer && pendingGet) {
      clearTimeout(pushTimer);
      runPending();
    }
  }

  function setStatus(text) {
    const el = typeof document !== "undefined" && document.querySelector("#cloud-state");
    if (el) el.textContent = text;
  }

  function bindUI() {
    const setup = document.querySelector("#cloud-setup");
    const actions = document.querySelector("#cloud-actions");
    const render = () => {
      const on = configured();
      setup.classList.toggle("hidden", on);
      actions.classList.toggle("hidden", !on);
      if (!on) setStatus("未配置");
    };
    document.querySelector("#cloud-connect").addEventListener("click", async () => {
      const key = document.querySelector("#cloud-key-input").value.trim();
      if (!key) return;
      localStorage.setItem(KEY_KEY, key);
      render();
      setStatus("正在连接云端…");
      const { status } = await api("/api/ping").catch(() => ({ status: 0 }));
      if (status !== 200) { setStatus("连不上云端，请检查网络或稍后再试"); return; }
      if (YueWordCloud.onConnect) YueWordCloud.onConnect();
    });
    document.querySelector("#cloud-key-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") document.querySelector("#cloud-connect").click();
    });
    document.querySelector("#cloud-sync-now").addEventListener("click", () => {
      setStatus("正在同步…");
      if (YueWordCloud.onConnect) YueWordCloud.onConnect();
    });
    document.querySelector("#cloud-disconnect").addEventListener("click", () => {
      localStorage.removeItem(KEY_KEY);
      localStorage.removeItem(KEY_REV);
      render();
    });
    render();
    // 关页/切后台前把还没上传的改动立刻推出去
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushNow(); });
    window.addEventListener("pagehide", flushNow);
  }

  const YueWordCloud = {
    configured, endpoint, localRev, setRev, fetchData, pushData, queuePush, setStatus,
    merge: null,          // app.js 注入：(云端数据, 本地数据) => 合并后的数据
    onConnect: null,      // app.js 注入：连接/手动同步时执行 bootCloud
    onMerged: null,       // app.js 注入：409 冲突自动合并后回写本地数据
  };

  window.YueWordCloud = YueWordCloud;
  if (typeof document !== "undefined") bindUI();
})();
