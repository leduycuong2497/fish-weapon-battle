// Thống kê trận đấu + lịch sử cơ bản trong localStorage (chỉ lưu tóm tắt nhỏ).

const STORAGE_KEY = 'fwb.history.v1';
const MAX_MATCHES = 30;

export function createMatchStats(fishCount) {
  return {
    initialCount: fishCount,
    totalHits: 0,
    totalDamage: 0,
    clashes: 0,
    wallHits: 0,
    antiLoopCorrections: 0,
    skillsUsed: 0,
    ultimates: 0,
    eliminated: 0,
  };
}

function getStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function loadHistory() {
  const st = getStorage();
  const empty = { wins: {}, matches: [] };
  if (!st) return empty;
  try {
    const data = JSON.parse(st.getItem(STORAGE_KEY) || 'null');
    if (!data || typeof data !== 'object') return empty;
    return { wins: data.wins || {}, matches: Array.isArray(data.matches) ? data.matches : [] };
  } catch {
    return empty;
  }
}

export function recordMatch(result) {
  const st = getStorage();
  const h = loadHistory();
  if (result.winnerSpecies) h.wins[result.winnerSpecies] = (h.wins[result.winnerSpecies] || 0) + 1;
  h.matches.unshift({
    at: Date.now(),
    seed: result.seed,
    count: result.initialCount,
    winner: result.winnerLabel,
    species: result.winnerSpecies || null,
    duration: Math.round(result.duration * 10) / 10,
    draw: !!result.draw,
  });
  h.matches.length = Math.min(h.matches.length, MAX_MATCHES);
  if (st) {
    try {
      st.setItem(STORAGE_KEY, JSON.stringify(h));
    } catch {
      /* hết dung lượng — bỏ qua */
    }
  }
  return h;
}

export function clearHistory() {
  const st = getStorage();
  if (st) st.removeItem(STORAGE_KEY);
}
