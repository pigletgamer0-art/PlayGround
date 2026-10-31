import * as THREE from 'three';
import { rand, TAU } from './utils.js';

function canvasTexture(width, height, draw, { repeat = null, anisotropy = 8 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
  }
  return texture;
}

export function makeFloorTexture(width = 64, length = 92) {
  const px = 16;
  return canvasTexture(width * px, length * px, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;

    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#160f13');
    base.addColorStop(0.16, '#0b1521');
    base.addColorStop(0.5, '#0a1422');
    base.addColorStop(0.84, '#0b1622');
    base.addColorStop(1, '#0d1a24');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    const glowTop = ctx.createRadialGradient(cx, 80, 20, cx, 80, 520);
    glowTop.addColorStop(0, 'rgba(255, 107, 61, 0.16)');
    glowTop.addColorStop(1, 'rgba(255, 107, 61, 0)');
    ctx.fillStyle = glowTop;
    ctx.fillRect(0, 0, w, h);

    const glowBottom = ctx.createRadialGradient(cx, h - 80, 20, cx, h - 80, 520);
    glowBottom.addColorStop(0, 'rgba(62, 233, 255, 0.14)');
    glowBottom.addColorStop(1, 'rgba(62, 233, 255, 0)');
    ctx.fillStyle = glowBottom;
    ctx.fillRect(0, 0, w, h);

    // fine tech grid
    ctx.strokeStyle = 'rgba(150, 205, 245, 0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += px * 2) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += px * 2) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // major panel grid
    ctx.strokeStyle = 'rgba(150, 205, 245, 0.075)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= w; x += px * 8) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += px * 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // scattered floor speckles / wear
    for (let i = 0; i < 900; i += 1) {
      ctx.fillStyle = `rgba(180, 220, 255, ${rand(0.01, 0.05)})`;
      ctx.fillRect(rand(0, w), rand(0, h), rand(1, 3), rand(1, 3));
    }

    ctx.lineJoin = 'round';
    const line = (color, widthPx, blur = 0) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = widthPx;
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
    };

    // outer boundary
    line('rgba(221, 245, 255, 0.55)', 5, 14);
    ctx.strokeRect(px * 1.4, px * 1.4, w - px * 2.8, h - px * 2.8);
    ctx.shadowBlur = 0;

    // halfway line
    line('rgba(210, 240, 255, 0.3)', 3, 8);
    ctx.beginPath();
    ctx.moveTo(px * 1.4, cy);
    ctx.lineTo(w - px * 1.4, cy);
    ctx.stroke();

    // center circle - split team colors
    const radius = px * 8;
    ctx.lineWidth = 5;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = 'rgba(255, 107, 61, 0.9)';
    ctx.shadowColor = 'rgba(255, 107, 61, 0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, Math.PI, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(62, 233, 255, 0.9)';
    ctx.shadowColor = 'rgba(62, 233, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI);
    ctx.stroke();

    ctx.fillStyle = 'rgba(235, 251, 255, 0.9)';
    ctx.shadowColor = 'rgba(180, 245, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, px * 0.7, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;

    // center wordmark
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(190, 225, 245, 0.12)';
    ctx.font = 'italic 700 58px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ROCKET DUEL', 0, -px * 10.5);
    ctx.restore();

    // penalty boxes
    const boxW = px * 36;
    const boxD = px * 16;
    for (const top of [true, false]) {
      const color = top ? 'rgba(255, 107, 61, 0.7)' : 'rgba(62, 233, 255, 0.7)';
      line(color, 4, 10);
      const y = top ? px * 3 : h - px * 3 - boxD;
      ctx.beginPath();
      ctx.moveTo(cx - boxW / 2, y);
      ctx.lineTo(cx - boxW / 2, y + boxD);
      ctx.lineTo(cx + boxW / 2, y + boxD);
      ctx.lineTo(cx + boxW / 2, y);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // goal crease arc
      const goalY = top ? px * 1.4 : h - px * 1.4;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.arc(cx, goalY, px * 7, top ? -Math.PI / 2 : Math.PI / 2, top ? Math.PI / 2 : Math.PI * 1.5, top ? false : false);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // corner speed chevrons
    for (const [x, y, flip] of [[px * 4, px * 4, 1], [w - px * 4, px * 4, -1], [px * 4, h - px * 4, 1], [w - px * 4, h - px * 4, -1]]) {
      ctx.strokeStyle = 'rgba(160, 225, 255, 0.18)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i += 1) {
        ctx.beginPath();
        ctx.moveTo(x + flip * i * 14, y);
        ctx.lineTo(x + flip * (i * 14 + 26), y + 26);
        ctx.stroke();
      }
    }

    // end zone labels (readable from each goal looking in)
    ctx.save();
    ctx.translate(cx, px * 9.5);
    ctx.rotate(Math.PI);
    ctx.fillStyle = 'rgba(255, 107, 61, 0.1)';
    ctx.font = '900 96px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NOVA', 0, 0);
    ctx.restore();

    ctx.save();
    ctx.translate(cx, h - px * 9.5);
    ctx.fillStyle = 'rgba(62, 233, 255, 0.11)';
    ctx.font = '900 96px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('YOU', 0, 0);
    ctx.restore();
  }, { anisotropy: 16 });
}

export function makePanelTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#101c2c');
    grad.addColorStop(0.55, '#0a1320');
    grad.addColorStop(1, '#060c16');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(150, 210, 255, 0.12)';
    ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, w - 6, h - 6);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 3;
    for (let x = 64; x < w; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(150, 210, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let y = 32; y < h; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    for (let x = 14; x < w; x += 64) {
      for (const y of [14, h - 14]) {
        ctx.fillStyle = 'rgba(170, 225, 255, 0.24)';
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, TAU);
        ctx.fill();
      }
    }
    for (let i = 0; i < 300; i += 1) {
      ctx.fillStyle = `rgba(200, 235, 255, ${rand(0.01, 0.04)})`;
      ctx.fillRect(rand(0, w), rand(0, h), 1, 1);
    }
  }, { repeat: [3, 3], anisotropy: 8 });
}

export function makeBallTexture() {
  return canvasTexture(1024, 512, (ctx, w, h) => {
    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#c6d2dc');
    base.addColorStop(0.45, '#dde4ea');
    base.addColorStop(0.72, '#bcc9d5');
    base.addColorStop(1, '#d4dde5');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    const size = 46;
    const hexHeight = Math.sqrt(3) * size;
    const hexWidth = 2 * size;
    let col = 0;
    for (let y = -hexHeight; y < h + hexHeight; y += hexHeight * 0.5) {
      const rowOffset = (col % 2) * (hexWidth * 0.5);
      for (let x = -hexWidth; x < w + hexWidth; x += hexWidth) {
        const cx = x + rowOffset;
        const cy = y;
        ctx.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const angle = (Math.PI / 3) * i;
          const px = cx + size * Math.cos(angle);
          const py = cy + hexHeight * 0.5 * Math.sin(angle) * 0.57735 * 1.732;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        const seed = Math.abs(Math.sin(cx * 0.013 + cy * 0.021));
        if (seed > 0.86) {
          ctx.fillStyle = 'rgba(224, 82, 38, 0.82)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(112, 30, 9, 0.5)';
        } else if (seed > 0.5) {
          ctx.fillStyle = 'rgba(166, 184, 201, 0.6)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(38, 52, 68, 0.55)';
        } else {
          ctx.strokeStyle = 'rgba(38, 52, 68, 0.6)';
        }
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      col += 1;
    }

    // tech seams
    ctx.strokeStyle = 'rgba(26, 40, 55, 0.5)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120, 235, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 18]);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    for (let i = 0; i < 200; i += 1) {
      ctx.fillStyle = `rgba(255, 255, 255, ${rand(0.02, 0.07)})`;
      ctx.fillRect(rand(0, w), rand(0, h), rand(1, 4), rand(1, 3));
    }

    // subtle vignettes at poles
    const pole = ctx.createLinearGradient(0, 0, 0, h);
    pole.addColorStop(0, 'rgba(30, 45, 60, 0.35)');
    pole.addColorStop(0.18, 'rgba(30, 45, 60, 0)');
    pole.addColorStop(0.82, 'rgba(30, 45, 60, 0)');
    pole.addColorStop(1, 'rgba(30, 45, 60, 0.35)');
    ctx.fillStyle = pole;
    ctx.fillRect(0, 0, w, h);
  }, { anisotropy: 8 });
}

export function makeNetTexture() {
  const texture = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(210, 240, 255, 0.65)';
    ctx.lineWidth = 1.4;
    for (let x = 0; x <= w; x += 22) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += 22) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(140, 200, 235, 0.2)';
    ctx.lineWidth = 1;
    for (let i = -h; i < w; i += 44) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.stroke();
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function makeBannerTexture(accent = '#3ee9ff', title = 'ROCKET DUEL', subtitle = '1V1 — FIRST TO 3') {
  return canvasTexture(1024, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(4, 9, 17, 0)');
    grad.addColorStop(0.2, 'rgba(6, 13, 24, 0.85)');
    grad.addColorStop(0.8, 'rgba(6, 13, 24, 0.85)');
    grad.addColorStop(1, 'rgba(4, 9, 17, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 30;
    ctx.fillRect(w * 0.22, h * 0.18, 5, h * 0.64);
    ctx.fillRect(w * 0.78 - 5, h * 0.18, 5, h * 0.64);

    ctx.shadowBlur = 34;
    ctx.fillStyle = '#f2fbff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'italic 700 92px "Chakra Petch", sans-serif';
    ctx.fillText(title, w / 2, h * 0.44);

    ctx.shadowBlur = 18;
    ctx.fillStyle = accent;
    ctx.font = '600 30px "Chakra Petch", sans-serif';
    ctx.fillText(subtitle, w / 2, h * 0.72);

    ctx.shadowBlur = 0;
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.22, h * 0.18);
    ctx.lineTo(w * 0.78, h * 0.18);
    ctx.moveTo(w * 0.22, h * 0.82);
    ctx.lineTo(w * 0.78, h * 0.82);
    ctx.stroke();
  }, { anisotropy: 8 });
}

export function makeGlowTexture() {
  const texture = canvasTexture(128, 128, (ctx, w, h) => {
    const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.24, 'rgba(255, 255, 255, 0.75)');
    grad.addColorStop(0.55, 'rgba(255, 255, 255, 0.18)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }, { anisotropy: 1 });
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

export function makeHaloTexture() {
  const texture = canvasTexture(256, 256, (ctx, w, h) => {
    const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    grad.addColorStop(0.12, 'rgba(200, 250, 255, 0.55)');
    grad.addColorStop(0.4, 'rgba(110, 225, 255, 0.12)');
    grad.addColorStop(1, 'rgba(80, 200, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }, { anisotropy: 2 });
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}
