import env from '../config/env';
import Sting from '../models/Sting';
import User from '../models/User';
import { createTtlCache } from '../utils/cache';
import { resolveZoneLabel } from './geocode.service';

const htmlCache = createTtlCache<string>(60_000);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function notFoundPage(): string {
  return `<!DOCTYPE html>
<html lang="ru"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hive</title>
</head><body style="font-family:-apple-system,sans-serif;background:#0b0b0c;color:#f5f5f4;margin:0;padding:48px 24px;text-align:center;">
<h1>Страница не найдена</h1>
<p>Этот момент недоступен.</p>
</body></html>`;
}

function layout(input: {
  title: string;
  description: string;
  image?: string | null;
  url: string;
  body: string;
}): string {
  const ogImage = input.image
    ? `<meta property="og:image" content="${escapeHtml(input.image)}">`
    : '';
  return `<!DOCTYPE html>
<html lang="ru"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.title)}</title>
<meta name="description" content="${escapeHtml(input.description)}">
<meta property="og:title" content="${escapeHtml(input.title)}">
<meta property="og:description" content="${escapeHtml(input.description)}">
<meta property="og:url" content="${escapeHtml(input.url)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
${ogImage}
<style>
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0b0b0c;color:#f5f5f4;}
  main{max-width:480px;margin:0 auto;padding:32px 20px;text-align:center;}
  img{width:100%;border-radius:16px;aspect-ratio:1;object-fit:cover;}
  a.btn{display:inline-block;margin:8px 6px;padding:12px 18px;border-radius:999px;background:#f97316;color:#111;text-decoration:none;font-weight:700;}
  a.ghost{background:transparent;color:#f5f5f4;border:1px solid #3f3f46;}
  p{color:#a1a1aa;line-height:1.5;}
</style>
</head><body><main>${input.body}</main></body></html>`;
}

export async function renderStingSharePage(id: string): Promise<{ status: number; html: string }> {
  const cached = htmlCache.get(id);
  if (cached) {
    return { status: cached.startsWith('<!--404') ? 404 : 200, html: cached.replace(/^<!--404-->/, '') };
  }

  const sting = await Sting.findById(id);
  if (!sting) {
    const html = `<!--404-->${notFoundPage()}`;
    htmlCache.set(id, html);
    return { status: 404, html: notFoundPage() };
  }

  const author = await User.findById(sting.authorId).select('settings');
  if (!author || author.settings?.allowSharing === false) {
    const html = `<!--404-->${notFoundPage()}`;
    htmlCache.set(id, html);
    return { status: 404, html: notFoundPage() };
  }

  const url = `${env.publicAppUrl.replace(/\/$/, '')}/share/stings/${id}`;
  const now = new Date();
  const expired = sting.expiresAt <= now || Boolean(sting.mediaPurgedAt);
  const label = sting.zoneId ? await resolveZoneLabel(sting.zoneId) : null;
  const place = label ?? 'Hive';
  const storeLinks = `<p>
    <a class="btn" href="hiveapp://sting/${id}">Открыть в Hive</a>
    <a class="btn ghost" href="${escapeHtml(env.appStoreUrl)}">App Store</a>
    <a class="btn ghost" href="${escapeHtml(env.playStoreUrl)}">Google Play</a>
  </p>`;

  if (expired) {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekCount = sting.zoneId
      ? await Sting.countDocuments({ zoneId: sting.zoneId, createdAt: { $gte: weekAgo } })
      : 0;
    const html = layout({
      title: 'Жало истекло — Hive',
      description: `В этом районе за неделю было ${weekCount} моментов`,
      url,
      body: `<h1>Этот момент уже истёк</h1>
        <p>В районе «${escapeHtml(place)}» за неделю было ${weekCount} моментов.</p>
        ${storeLinks}`,
    });
    htmlCache.set(id, html);
    return { status: 200, html };
  }

  const remainingMin = Math.max(1, Math.round((sting.expiresAt.getTime() - now.getTime()) / 60000));
  const html = layout({
    title: `${place} — Hive`,
    description: `Момент исчезнет через ${remainingMin} мин`,
    image: sting.thumbnailUrl,
    url,
    body: `<img src="${escapeHtml(sting.thumbnailUrl)}" alt="">
      <h1>${escapeHtml(place)}</h1>
      <p>Исчезнет через ${remainingMin} мин</p>
      ${storeLinks}`,
  });
  htmlCache.set(id, html);
  return { status: 200, html };
}

export async function renderPlaceSharePage(id: string): Promise<{ status: number; html: string }> {
  const cacheKey = `place:${id}`;
  const cached = htmlCache.get(cacheKey);
  if (cached) {
    return { status: cached.startsWith('<!--404') ? 404 : 200, html: cached.replace(/^<!--404-->/, '') };
  }

  const { default: Place } = await import('../models/Place');
  const { default: PlaceMedia } = await import('../models/PlaceMedia');
  const place = await Place.findById(id);
  if (!place || place.status !== 'live' || !place.coverThumbnailUrl) {
    const html = `<!--404-->${notFoundPage()}`;
    htmlCache.set(cacheKey, html);
    return { status: 404, html: notFoundPage() };
  }

  const cover = place.coverMediaId ? await PlaceMedia.findById(place.coverMediaId) : null;
  const image = cover?.imageUrl ?? place.coverThumbnailUrl;
  const url = `${env.publicAppUrl.replace(/\/$/, '')}/share/places/${id}`;
  const html = layout({
    title: `${place.name} — Hive`,
    description: place.address.formatted || place.name,
    image,
    url,
    body: `<img src="${escapeHtml(image)}" alt="">
      <h1>${escapeHtml(place.name)}</h1>
      <p>${escapeHtml(place.address.formatted)}</p>
      <p><a class="btn" href="hiveapp://place/${id}">Открыть в Hive</a></p>`,
  });
  htmlCache.set(cacheKey, html);
  return { status: 200, html };
}
