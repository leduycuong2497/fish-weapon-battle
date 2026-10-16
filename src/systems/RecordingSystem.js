// Ghi hình canvas đấu trường (chế độ dọc 1080×1920) bằng MediaRecorder.
// Ưu tiên MP4 nếu trình duyệt hỗ trợ; nếu không thì WebM (KHÔNG đổi đuôi giả thành .mp4).

export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;
export const REEL_FPS = 30;

const CANDIDATES = [
  { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
  { mime: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4' },
  { mime: 'video/mp4;codecs=avc1', ext: 'mp4' },
  { mime: 'video/mp4', ext: 'mp4' },
  { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
  { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
  { mime: 'video/webm;codecs=vp9', ext: 'webm' },
  { mime: 'video/webm', ext: 'webm' },
];

export function detectRecordingSupport() {
  if (typeof MediaRecorder === 'undefined') {
    return { supported: false, reason: 'Trình duyệt không hỗ trợ MediaRecorder.' };
  }
  const canvas = document.createElement('canvas');
  if (typeof canvas.captureStream !== 'function') {
    return { supported: false, reason: 'Trình duyệt không hỗ trợ canvas.captureStream().' };
  }
  const found = CANDIDATES.find((c) => MediaRecorder.isTypeSupported(c.mime));
  if (!found) return { supported: false, reason: 'Không tìm thấy định dạng video được hỗ trợ.' };
  const hasAudio = !!(globalThis.AudioContext || globalThis.webkitAudioContext);
  return { supported: true, mime: found.mime, ext: found.ext, isMp4: found.ext === 'mp4', hasAudio };
}

export class RecordingSystem {
  constructor() {
    this.recorder = null;
    this.chunks = [];
    this.startedAt = 0;
    this.format = null;
    this.lastBlob = null;
    this.lastUrl = null;
  }

  get active() {
    return !!this.recorder && this.recorder.state === 'recording';
  }

  get elapsed() {
    return this.active ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  start(canvas, audioStream) {
    const fmt = detectRecordingSupport();
    if (!fmt.supported) throw new Error(fmt.reason);
    if (canvas.width !== REEL_WIDTH || canvas.height !== REEL_HEIGHT) {
      throw new Error(`Canvas phải là ${REEL_WIDTH}×${REEL_HEIGHT} (hiện ${canvas.width}×${canvas.height}).`);
    }
    this.format = fmt;
    const stream = canvas.captureStream(REEL_FPS);
    if (audioStream) {
      for (const tr of audioStream.getAudioTracks()) stream.addTrack(tr);
    }
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: 10_000_000, audioBitsPerSecond: 128_000 });
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.stream = stream;
    this.recorder.start(250);
    this.startedAt = performance.now();
    return fmt;
  }

  stop() {
    return new Promise((resolve, reject) => {
      const rec = this.recorder;
      if (!rec) {
        reject(new Error('Chưa ghi hình.'));
        return;
      }
      rec.onstop = () => {
        const type = this.format.mime.split(';')[0];
        const blob = new Blob(this.chunks, { type });
        if (this.lastUrl) URL.revokeObjectURL(this.lastUrl);
        this.lastBlob = blob;
        this.lastUrl = URL.createObjectURL(blob);
        // dừng track video của canvas (track âm thanh dùng chung với AudioContext thì giữ lại)
        for (const tr of this.stream.getVideoTracks()) tr.stop();
        this.recorder = null;
        resolve({ blob, url: this.lastUrl, ext: this.format.ext, mime: type, size: blob.size, duration: (performance.now() - this.startedAt) / 1000 });
      };
      rec.onerror = (e) => reject(e.error || new Error('Lỗi ghi hình'));
      if (rec.state !== 'inactive') rec.stop();
    });
  }
}
