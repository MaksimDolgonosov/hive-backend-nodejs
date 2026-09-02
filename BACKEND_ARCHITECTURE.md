# Sting App — Архитектура backend

Версия: **0.4** (актуально на MVP, pre-production)  
Стек: **Node.js + Express + TypeScript + Mongoose (MongoDB) + Socket.io**

Этот документ заменяет собой предыдущую версию `BACKEND_ARCHITECTURE.md` (была на NestJS + Prisma + PostgreSQL/PostGIS) и отдельный `DB_SCHEMA.md`. Причина смены стека: разрабатывает один человек, приоритет — минимум абстракций и низкий порог входа над гибкостью и мощью инструментов.

Контракты API и WebSocket для frontend — в [TECH_DOCS.md](./TECH_DOCS.md) и [openapi.yaml](./openapi.yaml).

---

## Содержание

1. [Выбор стека и что изменилось](#1-выбор-стека-и-что-изменилось)
2. [Структура проекта](#2-структура-проекта)
3. [Слои и ответственность](#3-слои-и-ответственность)
4. [Модели данных (Mongoose)](#4-модели-данных-mongoose)
5. [Геозапросы](#5-геозапросы)
6. [Кластеризация ульев](#6-кластеризация-ульев)
7. [Истечение жал (TTL) и очистка ульев](#7-истечение-жал-ttl-и-очистка-ульев)
8. [Реальное время (WebSocket)](#8-реальное-время-websocket)
9. [Хранилище файлов](#9-хранилище-файлов)
10. [Безопасность публикации](#10-безопасность-публикации)
11. [Реализованные API-модули](#11-реализованные-api-модули)
12. [Инфраструктура и деплой](#12-инфраструктура-и-деплой)
13. [Что теряем при переходе с PostgreSQL/PostGIS](#13-что-теряем-при-переходе-с-postgresqlpostgis)

---

## 1. Выбор стека и что изменилось

**Node.js + Express + TypeScript + Mongoose + MongoDB** вместо NestJS + Prisma + PostgreSQL/PostGIS.

| Было | Стало | Почему так проще |
|---|---|---|
| Классы с `@Injectable()`, DI через конструктор | Обычные функции, `import` напрямую | Не нужно понимать dependency injection, чтобы прочитать код |
| Guards (`@UseGuards`, `@Public()`) | Middleware `requireAuth(req, res, next)` | Видно прямо в файле роутов, какой путь чем защищён |
| Decorators на методах (`@Post()`, `@Body()`) | `router.post('/login', authController.login)` | Весь список путей — в одном читаемом файле |
| Модули (`@Module`, imports/exports/providers) | Модульность через файловую структуру | Меньше фреймворковой магии поверх обычного JS |
| Prisma + raw SQL для geo | Mongoose с `2dsphere`, `$near`/`$geoWithin` | Геозапросы — простые методы, без SQL |
| Cron-джоба на истечение TTL | Нативный TTL-индекс MongoDB | Документ удаляется сам, отдельный cron не нужен |

---

## 2. Структура проекта

```
hive-backend-nodejs/
├── server.ts                      # точка входа: БД → HTTP-сервер → Socket.io
├── scripts/
│   └── ws-test.ts                 # npm run ws:test — проверка WebSocket из терминала
├── src/
│   ├── app.ts                     # сборка Express-приложения, маршруты /api/v1/*
│   │
│   ├── config/
│   │   ├── db.ts                  # подключение к MongoDB
│   │   └── env.ts                 # переменные окружения
│   │
│   ├── models/                    # Mongoose-схемы
│   │   ├── User.ts
│   │   ├── RefreshToken.ts
│   │   ├── Sting.ts
│   │   └── Hive.ts
│   │
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── stings.routes.ts
│   │   └── hives.routes.ts
│   │
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── stings.controller.ts
│   │   └── hives.controller.ts
│   │
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── stings.service.ts
│   │   ├── hives.service.ts
│   │   ├── clustering.service.ts
│   │   ├── hive-cleanup.service.ts
│   │   ├── sting-validation.service.ts   # анти-спуфинг
│   │   ├── storage.service.ts            # local / Cloudflare R2
│   │   └── image.service.ts              # sharp: thumbnail, avatar
│   │
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   ├── error.middleware.ts
│   │   ├── validate.middleware.ts
│   │   ├── upload.middleware.ts
│   │   └── rate-limit.middleware.ts
│   │
│   ├── validators/
│   │   ├── auth.validators.ts
│   │   ├── stings.validators.ts
│   │   └── hives.validators.ts
│   │
│   ├── utils/
│   │   ├── AppError.ts
│   │   ├── geo.ts
│   │   └── sting.mapper.ts
│   │
│   ├── types/
│   │   ├── sting.ts
│   │   ├── realtime.ts
│   │   ├── express.d.ts
│   │   └── socket.d.ts
│   │
│   └── sockets/
│       └── realtime.ts            # Socket.io, path /ws
│
├── uploads/                       # локальное хранилище (STORAGE_DRIVER=local)
├── docker-compose.yml             # MongoDB для разработки (порт 27018)
├── openapi.yaml
├── TECH_DOCS.md
├── .env.example
├── tsconfig.json
└── package.json
```

Сборка: `npm run build` → `dist/`. Dev: `npm run dev` (tsx watch).

---

## 3. Слои и ответственность

| Слой | Ответственность |
|---|---|
| **routes** | Только маппинг `путь + HTTP-метод → middleware-цепочка → контроллер`. Ноль логики |
| **middleware** | Валидация, JWT, upload, rate limit, единый формат ошибки |
| **controllers** | Забирает данные из `req`, вызывает `service`, формирует HTTP-ответ. Без бизнес-правил |
| **services** | Вся бизнес-логика. Ничего не знает про `req`/`res` |
| **models** | Mongoose-схемы: структура документа, индексы |

Поток запроса: `routes → middleware → controller → service → model`. Ошибки — через `next(err)` в `error.middleware.ts` (подключается последним в `app.ts`).

---

## 4. Модели данных (Mongoose)

### 4.1 `User`

```ts
{
  email: string;          // unique, lowercase
  passwordHash: string | null;
  username: string;       // unique
  emailVerified: boolean; // false до OTP
  status: 'pending' | 'active' | 'disabled';
  avatarUrl: string | null;
  createdAt, updatedAt   // timestamps
}
```

### 4.2 `EmailOtpChallenge`

Одноразовые коды email (регистрация и сброс пароля). В БД хранится только `codeHash` (HMAC-SHA256), plaintext — только в письме.

```ts
{
  userId: ObjectId | null;
  email: string;          // lowercase
  purpose: 'register' | 'password_reset';
  codeHash: string;
  expiresAt: Date;        // TTL кода, 10 минут
  attempts: number;
  consumedAt: Date | null;
  lastSentAt: Date;       // cooldown resend 60 с
  createdAt: Date;
}
```

### 4.3 `RefreshToken`

```ts
{
  userId: ObjectId;
  tokenHash: string;      // SHA-256 от refresh-токена, unique
  deviceInfo: string | null;
  expiresAt: Date;        // TTL-индекс
  revokedAt: Date | null;
  issuedAt: Date;         // createdAt переименован
}
```

### 4.4 `Sting`

```ts
{
  authorId: ObjectId;
  hiveId: ObjectId | null;
  imageUrl, thumbnailUrl: string;
  location: { type: 'Point', coordinates: [lng, lat] };
  accuracyM: number | null;
  capturedAt: Date;
  expiresAt: Date;        // TTL-индекс
  reactionsCount: number;
  idempotencyKey: string | null;  // unique sparse (authorId + key)
  createdAt, updatedAt
}
```

Индексы: `2dsphere` на `location`, TTL на `expiresAt`, `{ authorId, createdAt }`, sparse `{ hiveId }`, unique sparse `{ authorId, idempotencyKey }`.

### 4.5 `Hive`

```ts
{
  center: { type: 'Point', coordinates: [lng, lat] };
  radiusM: number;              // default 150, из HIVE_RADIUS_M
  activeStingsCount: number;
  createdAt, updatedAt
}
```

Индекс: `2dsphere` на `center`.

---

## 5. Геозапросы

**Bounding box карты** (`GET /stings/nearby`):

- Жала: `$geoWithin` + `$box`, `expiresAt > now`, `hiveId: null` (одиночные точки)
- Ульи: `$geoWithin` + `$box`, `activeStingsCount > 0`

**Радиус от точки** (кластеризация):

```js
Hive.findOne({
  center: {
    $near: {
      $geometry: { type: 'Point', coordinates: [lng, lat] },
      $maxDistance: HIVE_RADIUS_M,
    },
  },
});
```

---

## 6. Кластеризация ульев

Реализовано в `clustering.service.ts`, вызывается из `stings.service.ts` после сохранения жала:

```
При публикации нового Sting:
  1. Ищем Hive в радиусе HIVE_RADIUS_M ($near)
     → нашли: attach hiveId, activeStingsCount += 1
  2. Не нашли:
     а. Считаем активные Sting без hiveId в радиусе
     б. Если count >= HIVE_ACTIVATION_THRESHOLD:
        создаём Hive (центроид точек), присваиваем hiveId всем
     в. Иначе hiveId остаётся null
```

---

## 7. Истечение жал (TTL) и очистка ульев

**TTL жала:** индекс на `expiresAt` — MongoDB удаляет документ сам (~60 с задержки).

**Очистка ульев** (`hive-cleanup.service.ts`):

| Среда | Механизм |
|---|---|
| **MongoDB Atlas** (replica set) | Change Streams на коллекции `stings` — реакция на delete |
| **Локальный Docker** (standalone) | Fallback: `reconcileHives()` каждые `HIVE_CLEANUP_INTERVAL_MS` (60 с) |

При удалении/истечении жала:
- декремент `activeStingsCount`
- если 0 — удаление Hive, WS-событие `hive:dissolved`
- иначе — `hive:updated`
- всегда — `sting:expired`

Ручное удаление жала (`DELETE /stings/:id`) вызывает `notifyStingRemoved`, если Change Streams неактивны.

---

## 8. Реальное время (WebSocket)

**Socket.io**, path **`/ws`**, auth: `?token=<accessToken>` (JWT access).

Клиент отправляет JSON на канал `message`:

| Client → Server | Назначение |
|---|---|
| `subscribe:region` | Подписка на bbox карты |
| `unsubscribe:region` | Отписка |
| `ping` | Keepalive → ответ `pong` |

| Server → Client | Когда |
|---|---|
| `sting:created` | Новое одиночное жало в регионе |
| `sting:expired` | Жало истекло или удалено |
| `hive:updated` | Изменился счётчик улья |
| `hive:dissolved` | Улей растворился |
| `sting:reaction` | Обновился счётчик реакций |

Маппинг `socketId → bbox` хранится **в памяти процесса** (`Map`). Для нескольких инстансов потребуется Redis adapter.

Проверка из терминала: `npm run ws:test -- <accessToken>`.

---

## 9. Хранилище файлов

Переключатель: `STORAGE_DRIVER=local | r2`.

| Тип | Local | R2 |
|---|---|---|
| Фото жала | `uploads/{uuid}.jpg` | `stings/{uuid}.jpg` |
| Thumbnail | `uploads/{uuid}_thumb.jpg` | `stings/{uuid}_thumb.jpg` |
| Аватар | `uploads/avatars/{userId}.jpg` | `avatars/{userId}.jpg` |

Local: раздача через `express.static` на `/uploads`. URL строится из `BASE_URL`.

Обработка: `sharp` — JPEG, thumbnail 400px, аватар 256×256 crop.

---

## 10. Безопасность публикации

`sting-validation.service.ts` — вызывается в `createSting` до загрузки фото.

| Проверка | Отказ |
|---|---|
| GPS `(0,0)`, `accuracy` вне `[MIN, MAX]` | `SUSPICIOUS_GPS` |
| `capturedAt` vs серверное время > tolerance (2 мин) | `CAPTURED_AT_MISMATCH` |
| EXIF datetime ≠ `capturedAt` | `EXIF_MISMATCH` |
| EXIF GPS далеко от заявленных координат | `EXIF_GPS_MISMATCH` |

Если EXIF отсутствует (часто на Android) — проверяются только GPS и время.

**Rate limit:** `express-rate-limit` на `POST /stings` — `STING_RATE_LIMIT_MAX` запросов за `STING_RATE_LIMIT_WINDOW_MS` на пользователя → `429 RATE_LIMITED`.

**Idempotency:** заголовок `Idempotency-Key` — повторный запрос возвращает существующее жало.

---

## 11. Реализованные API-модули

Префикс: **`/api/v1`**. Полная спецификация — [openapi.yaml](./openapi.yaml).

### Auth

| Метод | Путь |
|---|---|
| POST | `/auth/register` |
| POST | `/auth/login` |
| POST | `/auth/refresh` |
| POST | `/auth/logout` |
| GET | `/auth/me` |
| POST | `/auth/me/avatar` — multipart, поле `avatar` (JPEG, ≤2 МБ) |
| DELETE | `/auth/me/avatar` |

### Stings

| Метод | Путь |
|---|---|
| GET | `/stings/nearby?swLat&swLng&neLat&neLng` |
| POST | `/stings` — multipart: `photo`, `lat`, `lng`, `accuracy`, `capturedAt` |
| GET | `/stings/:id` |
| DELETE | `/stings/:id` |
| POST | `/stings/:id/reactions` — `{ "type": "like" }` |

### Hives

| Метод | Путь |
|---|---|
| GET | `/hives/:id` — улей + все активные жала |
| GET | `/hives/:id/stings?cursor&limit` — курсорная пагинация |

---

## 12. Инфраструктура и деплой

**Статус:** MVP backend реализован локально. **Production deploy — следующий шаг.**

| Компонент | Рекомендация |
|---|---|
| **API** | Railway или Render (Git deploy, WebSocket) |
| **БД** | MongoDB Atlas M0+ (replica set → Change Streams) |
| **Фото** | Cloudflare R2 (`STORAGE_DRIVER=r2`) |
| **Redis** | Не используется (один инстанс) |

Чеклист деплоя:
1. Создать кластер Atlas, получить `MONGO_URI`
2. Создать bucket R2, задать `R2_*` и `R2_PUBLIC_URL`
3. Сгенерировать production `JWT_ACCESS_SECRET`
4. Задать `BASE_URL=https://your-api.example.com`
5. Deploy: `npm run build && npm start`
6. Проверить REST + WebSocket + upload

---

## 13. Что теряем при переходе с PostgreSQL/PostGIS

- **Точность TTL** — задержка до ~60 с (на практике сопоставимо с cron).
- **Сложная геоаналитика** — `2dsphere` покрывает bbox и радиус; полигоны возможны через `$geoWithin`, но без богатства PostGIS.
- **FK и строгая схема** — целостность в коде сервисов, не в БД.
- **Транзакции** — для текущей модели (одна запись на публикацию) не критично.

На текущем масштабе это не блокирует продукт.
