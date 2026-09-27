'use strict';

/**
 * Загрузка реальных фотографий бизнеса с CDN 2ГИС.
 *
 * URL фото в 2ГИС поддерживают параметр ширины, поэтому одна и та же картинка
 * доступна в разных размерах. Скрипт:
 *   1. определяет, какой формат уменьшения поддерживает CDN;
 *   2. качает нужный размер;
 *   3. пишет отчёт с размерами файлов.
 *
 * Запуск:
 *   node tools/fetch-photos.js --width=640 --out=.research/thumbs
 *   node tools/fetch-photos.js --width=1920 --out=public/images/gallery --pick=1,3,7
 */

const fs = require('fs/promises');
const path = require('path');

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

const WIDTH = Number(arg('width', '640'));
const OUT = path.resolve(arg('out', '.research/thumbs'));
const PICK = arg('pick', '')
  .split(',')
  .map((v) => Number(v.trim()))
  .filter((v) => Number.isFinite(v) && v > 0);
const SOURCE = path.resolve(arg('source', 'research/2gis-photos.json'));
const SUFFIX = arg('suffix', '');

const HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  referer: 'https://2gis.kz/',
  accept: 'image/avif,image/webp,image/jpeg,image/png,*/*'
};

/** Варианты URL: параметр ширины, суффикс размера, оригинал. */
function variants(url) {
  const list = [];
  const noQuery = url.split('?')[0];
  if (WIDTH) {
    list.push(`${url}${url.includes('?') ? '&' : '?'}w=${WIDTH}`);
    list.push(`${noQuery.replace(/\.jpg$/i, `_${WIDTH}x.jpg`)}`);
  }
  list.push(url);
  return list;
}

async function grab(url) {
  const response = await fetch(url, { headers: HEADERS, redirect: 'follow' });
  if (!response.ok) return { ok: false, status: response.status };
  const type = response.headers.get('content-type') || '';
  if (!type.startsWith('image/')) return { ok: false, status: `тип ${type}` };
  const buffer = Buffer.from(await response.arrayBuffer());
  return { ok: true, buffer, type, bytes: buffer.length };
}

/** Размеры JPEG из заголовка — без внешних библиотек. */
function jpegSize(buffer) {
  let offset = 2;
  while (offset < buffer.length - 9) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

async function main() {
  const data = JSON.parse(await fs.readFile(SOURCE, 'utf8'));
  const photos = (data.photos || []).filter((photo) => !/logo\/2gis/.test(photo.url || ''));
  const entrance = (data.entrance || []).map((item) => ({ ...item, entrance: true }));
  const all = [...photos, ...entrance];

  const selected = PICK.length ? PICK.map((n) => all[n - 1]).filter(Boolean) : all;

  await fs.mkdir(OUT, { recursive: true });
  console.log(`Источник: ${path.relative(process.cwd(), SOURCE)}`);
  console.log(`Качаю ${selected.length} фото шириной ${WIDTH}px → ${path.relative(process.cwd(), OUT)}\n`);

  const report = [];
  let index = 0;

  for (const photo of selected) {
    index += 1;
    const number = PICK.length ? PICK[index - 1] : index;
    const name = `${String(number).padStart(2, '0')}${photo.entrance ? '-entrance' : ''}${SUFFIX}.jpg`;
    const file = path.join(OUT, name);

    let saved = null;
    for (const candidate of variants(photo.url)) {
      try {
        const result = await grab(candidate);
        if (result.ok && result.bytes > 5000) {
          const size = jpegSize(result.buffer);
          await fs.writeFile(file, result.buffer);
          saved = {
            file: name,
            number,
            bytes: result.bytes,
            kb: Math.round(result.bytes / 1024),
            width: size ? size.width : null,
            height: size ? size.height : null,
            source: candidate.split('?')[0].split('/').pop(),
            variant: candidate.includes('?') ? 'query' : candidate.includes('_') ? 'suffix' : 'original',
            alt: photo.alt || ''
          };
          break;
        }
      } catch {
        /* пробуем следующий вариант */
      }
    }

    if (saved) {
      report.push(saved);
      console.log(
        `  ${saved.file.padEnd(18)} ${String(saved.kb).padStart(5)} КБ  ` +
          `${saved.width}x${saved.height}  ${saved.variant}  ${saved.alt.slice(0, 34)}`
      );
    } else {
      console.log(`  ${name.padEnd(18)} НЕ СКАЧАЛОСЬ`);
    }
  }

  const totalKb = report.reduce((sum, item) => sum + item.kb, 0);
  console.log(`\nФайлов: ${report.length}, суммарно ${(totalKb / 1024).toFixed(1)} МБ`);

  const reportFile = path.join(OUT, 'report.json');
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Отчёт: ${path.relative(process.cwd(), reportFile)}`);
}

main().catch((error) => {
  console.error('Ошибка загрузки:', error.message);
  process.exit(1);
});
