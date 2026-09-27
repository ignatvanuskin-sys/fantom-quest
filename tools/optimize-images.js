'use strict';

/**
 * Обработка изображений без внешних зависимостей — через canvas в headless Chrome.
 *
 * Зачем: у проекта нет и не должно быть тяжёлых зависимостей (sharp, imagemagick),
 * а фотографии реального бизнеса весят по 0,5–1 МБ. Chrome умеет и то и другое:
 * масштабирование, JPEG и WebP. Скрипт используется для двух задач:
 *
 *   1. contact-sheet — собрать несколько фото в один лист с подписями,
 *      чтобы быстро отсмотреть большую галерею;
 *   2. webp — пережать выбранные фото в WebP нужной ширины для сайта.
 *
 * Запуск:
 *   node tools/optimize-images.js sheet --in=.research/thumbs --out=.research/sheets --per=9
 *   node tools/optimize-images.js webp --in=.research/thumbs --out=public/images/gallery \
 *        --pick=2,3,6 --widths=1600,800 --quality=80
 */

const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const mode = args.find((a) => !a.startsWith('--')) || 'sheet';
const arg = (name, fallback) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

const IN = path.resolve(arg('in', '.research/thumbs'));
const OUT = path.resolve(arg('out', '.research/sheets'));
const PER = Number(arg('per', '9'));
const WIDTHS = arg('widths', '1600')
  .split(',')
  .map((v) => Number(v.trim()))
  .filter(Boolean);
const QUALITY = Number(arg('quality', '80'));
const FORMAT = arg('format', 'webp');
const PICK = arg('pick', '')
  .split(',')
  .map((v) => Number(v.trim()))
  .filter((v) => Number.isFinite(v) && v > 0);
const PREFIX = arg('prefix', '');
const PORT = 9600 + Math.floor(Math.random() * 300);

const CHROME = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome'
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
  for (const candidate of CHROME) {
    try {
      require('fs').accessSync(candidate);
      return candidate;
    } catch {
      /* следующий */
    }
  }
  return null;
}

function cdp(ws) {
  const pending = new Map();
  let nextId = 1;
  ws.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });
  return {
    send(method, params) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params: params || {} }));
      });
    }
  };
}

async function launch(browser) {
  const profile = await fs.mkdtemp(path.join(require('os').tmpdir(), 'fantom-img-'));
  const child = spawn(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--allow-file-access-from-files',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      'about:blank'
    ],
    { stdio: 'ignore' }
  );

  for (let i = 0; i < 40; i += 1) {
    await sleep(250);
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break;
    } catch {
      /* ещё поднимается */
    }
  }
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const target = list.find((t) => t.type === 'page') || list[0];
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('WebSocket отклонён')), { once: true });
  });
  const client = cdp(ws);
  await client.send('Runtime.enable');
  return { client, ws, child, profile };
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'ошибка в браузере');
  return result.result.value;
}

const dataUrl = (buffer, mime) => `data:${mime};base64,${buffer.toString('base64')}`;

/* ── Режим 1: контактные листы ───────────────────────────────────────────── */

async function contactSheets(client) {
  const files = (await fs.readdir(IN)).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f)).sort();
  if (!files.length) throw new Error(`В ${IN} нет изображений`);

  await fs.mkdir(OUT, { recursive: true });
  const columns = 3;
  const rows = Math.ceil(PER / columns);
  const cellW = 320;
  const cellH = 420;

  const sheets = Math.ceil(files.length / PER);
  console.log(`Изображений: ${files.length} → листов: ${sheets} (по ${PER})\n`);

  for (let sheet = 0; sheet < sheets; sheet += 1) {
    const batch = files.slice(sheet * PER, (sheet + 1) * PER);
    const payload = [];
    for (const name of batch) {
      const buffer = await fs.readFile(path.join(IN, name));
      payload.push({ name, data: dataUrl(buffer, 'image/jpeg') });
    }

    const expression = `
      (async function () {
        var items = ${JSON.stringify(payload)};
        var canvas = document.createElement('canvas');
        canvas.width = ${columns * cellW};
        canvas.height = ${rows * cellH};
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (var i = 0; i < items.length; i += 1) {
          var img = await new Promise(function (resolve, reject) {
            var image = new Image();
            image.onload = function () { resolve(image); };
            image.onerror = function () { resolve(null); };
            image.src = items[i].data;
          });
          var col = i % ${columns};
          var row = Math.floor(i / ${columns});
          var x = col * ${cellW};
          var y = row * ${cellH};
          if (img) {
            var scale = Math.max(${cellW} / img.width, ${cellH} / img.height);
            var w = img.width * scale;
            var h = img.height * scale;
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, ${cellW}, ${cellH});
            ctx.clip();
            ctx.drawImage(img, x + (${cellW} - w) / 2, y + (${cellH} - h) / 2, w, h);
            ctx.restore();
          }
          ctx.fillStyle = 'rgba(0,0,0,0.72)';
          ctx.fillRect(x + 6, y + ${cellH} - 34, 92, 26);
          ctx.fillStyle = '#b8d84b';
          ctx.font = 'bold 19px Consolas, monospace';
          ctx.fillText(items[i].name.replace(/\\.\\w+$/, ''), x + 14, y + ${cellH} - 14);
          ctx.strokeStyle = 'rgba(255,255,255,0.14)';
          ctx.strokeRect(x + 0.5, y + 0.5, ${cellW} - 1, ${cellH} - 1);
        }
        return canvas.toDataURL('image/jpeg', 0.78);
      })()
    `;

    const result = await evaluate(client, expression);
    const base64 = String(result).split(',')[1];
    const file = path.join(OUT, `sheet-${String(sheet + 1).padStart(2, '0')}.jpg`);
    await fs.writeFile(file, Buffer.from(base64, 'base64'));
    const size = (await fs.stat(file)).size;
    console.log(
      `  ${path.basename(file)}  ${String(Math.round(size / 1024)).padStart(5)} КБ  ` +
        `${batch[0].replace(/\.\w+$/, '')}–${batch[batch.length - 1].replace(/\.\w+$/, '')}`
    );
  }
}

/* ── Режим 2: оптимизация в WebP/JPEG ───────────────────────────────────── */

async function optimize(client) {
  let files = (await fs.readdir(IN)).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f)).sort();
  if (PICK.length) {
    files = PICK.map((n) => {
      const candidate = files.find((f) => f.startsWith(String(n).padStart(2, '0')));
      return candidate;
    }).filter(Boolean);
  }
  if (!files.length) throw new Error('Нечего оптимизировать');

  await fs.mkdir(OUT, { recursive: true });
  console.log(`Оптимизирую ${files.length} фото → ${FORMAT}, ширины ${WIDTHS.join(', ')}\n`);

  const report = [];
  for (const name of files) {
    const buffer = await fs.readFile(path.join(IN, name));
    const originalKb = Math.round(buffer.length / 1024);
    const base = PREFIX + name.replace(/\.\w+$/, '');

    for (const width of WIDTHS) {
      const expression = `
        (async function () {
          var img = await new Promise(function (resolve) {
            var image = new Image();
            image.onload = function () { resolve(image); };
            image.onerror = function () { resolve(null); };
            image.src = ${JSON.stringify(dataUrl(buffer, 'image/jpeg'))};
          });
          if (!img) return JSON.stringify({ error: 'не загрузилось' });
          var target = Math.min(${width}, img.width);
          var scale = target / img.width;
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          var ctx = canvas.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          return JSON.stringify({
            data: canvas.toDataURL('image/${FORMAT}', ${QUALITY / 100}),
            width: canvas.width,
            height: canvas.height
          });
        })()
      `;
      const raw = await evaluate(client, expression);
      const parsed = JSON.parse(raw);
      if (parsed.error) {
        console.log(`  ${name} @${width}: ${parsed.error}`);
        continue;
      }
      const out = parsed.data.split(',')[1];
      const suffix = WIDTHS.length > 1 ? `-${width}` : '';
      const file = path.join(OUT, `${base}${suffix}.${FORMAT}`);
      await fs.writeFile(file, Buffer.from(out, 'base64'));
      const bytes = (await fs.stat(file)).size;
      report.push({
        file: path.basename(file),
        width: parsed.width,
        height: parsed.height,
        kb: Math.round(bytes / 1024),
        savedFrom: name
      });
      console.log(
        `  ${path.basename(file).padEnd(24)} ${String(parsed.width).padStart(4)}x${String(parsed.height).padEnd(5)} ` +
          `${String(Math.round(bytes / 1024)).padStart(4)} КБ  (было ${originalKb} КБ)`
      );
    }
  }

  const totalKb = report.reduce((sum, item) => sum + item.kb, 0);
  console.log(`\nФайлов: ${report.length}, суммарно ${(totalKb / 1024).toFixed(1)} МБ`);
  await fs.writeFile(path.join(OUT, 'optimize-report.json'), JSON.stringify(report, null, 2), 'utf8');
}

/* ── Режим 3: вырезать область и увеличить (для чтения мелкого текста) ──── */

async function cropZoom(client) {
  const file = arg('file', '');
  if (!file) throw new Error('Нужен --file=<имя в папке --in>');
  const [x, y, w, h] = arg('crop', '0,0,400,400').split(',').map(Number);
  const scale = Number(arg('scale', '2'));
  const quality = Number(arg('quality', '92'));

  const buffer = await fs.readFile(path.join(IN, file));
  const expression = `
    (async function () {
      var img = await new Promise(function (resolve) {
        var image = new Image();
        image.onload = function () { resolve(image); };
        image.src = ${JSON.stringify(dataUrl(buffer, 'image/jpeg'))};
      });
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(${w} * ${scale});
      canvas.height = Math.round(${h} * ${scale});
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, ${x}, ${y}, ${w}, ${h}, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', ${quality / 100});
    })()
  `;
  const result = await evaluate(client, expression);
  await fs.mkdir(OUT, { recursive: true });
  const out = path.join(OUT, `${file.replace(/\.\w+$/, '')}-crop.jpg`);
  await fs.writeFile(out, Buffer.from(String(result).split(',')[1], 'base64'));
  const size = (await fs.stat(out)).size;
  console.log(`  ${path.basename(out)}  ${(size / 1024).toFixed(0)} КБ  область ${x},${y} ${w}x${h} ×${scale}`);
}

/* ── Режим 4: карточка Open Graph 1200×630 ──────────────────────────────── */

async function openGraphCard(client) {
  const photoFile = arg('file', 'nun-hood-1440.webp');
  const outName = arg('name', 'og');
  await fs.mkdir(OUT, { recursive: true });
  const buffer = await fs.readFile(path.join(IN, photoFile));

  const title = arg('title', 'FANTOM');
  const lines = arg('lines', 'ХОРРОР-КВЕСТ · УСТЬ-КАМЕНОГОРСК|60 МИНУТ · ЗАКЛЯТИЯ-ПРОКЛЯТИЯ МОНАХИНИ|ПРОСПЕКТ НАЗАРБАЕВА, 50 · ЕЖЕДНЕВНО 09:00–02:00').split('|');
  const cta = arg('cta', 'ЗАБРОНИРОВАТЬ');

  const expression = `
    (async function () {
      var W = 1200, H = 630;
      var canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      var ctx = canvas.getContext('2d');

      // Фон: почти чёрный графит с холодным свечением справа.
      ctx.fillStyle = '#08090a';
      ctx.fillRect(0, 0, W, H);

      var img = await new Promise(function (resolve) {
        var image = new Image();
        image.onload = function () { resolve(image); };
        image.onerror = function () { resolve(null); };
        image.src = ${JSON.stringify(dataUrl(buffer, 'image/webp'))};
      });

      // Фотография занимает правую часть и растворяется в фоне слева.
      if (img) {
        var panelW = 620;
        var scale = Math.max(panelW / img.width, H / img.height);
        var w = img.width * scale;
        var h = img.height * scale;
        ctx.drawImage(img, W - panelW + (panelW - w) / 2, (H - h) / 2, w, h);
        var fade = ctx.createLinearGradient(W - panelW - 120, 0, W - panelW + 260, 0);
        fade.addColorStop(0, 'rgba(8,9,10,1)');
        fade.addColorStop(0.55, 'rgba(8,9,10,0.86)');
        fade.addColorStop(1, 'rgba(8,9,10,0)');
        ctx.fillStyle = fade;
        ctx.fillRect(W - panelW - 120, 0, panelW + 120, H);
      }

      var glow = ctx.createRadialGradient(150, 560, 10, 150, 560, 520);
      glow.addColorStop(0, 'rgba(229,57,53,0.26)');
      glow.addColorStop(1, 'rgba(229,57,53,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 760, H);

      // Рамка кадра.
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 2;
      ctx.strokeRect(28, 28, W - 56, H - 56);

      // Метка наблюдения.
      ctx.fillStyle = '#ff756f';
      ctx.font = '600 17px Consolas, monospace';
      ctx.fillText('CAM-04 · BASEMENT', 62, 86);
      ctx.beginPath();
      ctx.arc(W - 118, 80, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#e53935';
      ctx.fill();
      ctx.font = '600 17px Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.fillText('REC', W - 136, 86);
      ctx.textAlign = 'left';

      ctx.fillStyle = '#f1ece3';
      ctx.font = '800 92px "Segoe UI", Arial, sans-serif';
      ctx.fillText(${JSON.stringify(title)}, 60, 268);

      var y = 336;
      var sizes = [30, 25, 21];
      for (var i = 0; i < ${lines.length}; i += 1) {
        ctx.fillStyle = i === 0 ? '#b8d84b' : '#c3c9c5';
        ctx.font = (i === 0 ? '700 ' : '400 ') + sizes[Math.min(i, 2)] + 'px "Segoe UI", Arial, sans-serif';
        ctx.fillText(${JSON.stringify(lines)}[i], 62, y);
        y += i === 0 ? 46 : 38;
      }

      ctx.fillStyle = '#e53935';
      ctx.fillRect(60, 496, 372, 66);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 26px "Segoe UI", Arial, sans-serif';
      ctx.fillText(${JSON.stringify(cta)}, 82, 539);

      return canvas.toDataURL('image/jpeg', 0.9);
    })()
  `;

  const result = await evaluate(client, expression);
  const out = path.join(OUT, `${outName}.jpg`);
  await fs.writeFile(out, Buffer.from(String(result).split(',')[1], 'base64'));
  console.log(`  ${path.basename(out)}  ${((await fs.stat(out)).size / 1024).toFixed(0)} КБ  1200×630`);
}

async function main() {
  const browser = findBrowser();
  if (!browser) {
    console.error('Chrome/Edge не найден. Укажите CHROME_PATH.');
    process.exit(2);
  }
  const { client, ws, child, profile } = await launch(browser);
  try {
    if (mode === 'sheet') await contactSheets(client);
    else if (mode === 'webp') await optimize(client);
    else if (mode === 'crop') await cropZoom(client);
    else if (mode === 'card') await openGraphCard(client);
    else throw new Error(`Неизвестный режим: ${mode}`);
  } finally {
    ws.close();
    child.kill();
    await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error('Ошибка:', error.message);
  process.exit(1);
});
