# Sting App — Архитектура backend

Версия: 0.3
Стек: Node.js + Express + Mongoose (MongoDB) + Socket.io

Этот документ заменяет собой предыдущую версию `BACKEND_ARCHITECTURE.md` (была на NestJS + Prisma + PostgreSQL/PostGIS) и отдельный `DB_SCHEMA.md`. Причина смены стека: разрабатывает один человек, приоритет — минимум абстракций и низкий порог входа над гибкостью и мощью инструментов.

---

## Содержание

1. [Выбор стека и что изменилось](#1-выбор-стека-и-что-изменилось)
2. [Структура проекта](#2-структура-проекта)
3. [Слои и ответственность](#3-слои-и-ответственность)
4. [Модели данных (Mongoose)](#4-модели-данных-mongoose)
5. [Геозапросы](#5-геозапросы)
6. [Кластеризация ульев](#6-кластеризация-ульев)
7. [Истечение жал (TTL)](#7-истечение-жал-ttl)
8. [Реальное время (WebSocket)](#8-реальное-время-websocket)
9. [Инфраструктура и деплой](#9-инфраструктура-и-деплой)
10. [Что теряем при переходе с PostgreSQL/PostGIS](#10-что-теряем-при-переходе-с-postgresqlpostgis)

---

## 1. Выбор стека и что изменилось

**Node.js + Express + Mongoose + MongoDB** вместо NestJS + Prisma + PostgreSQL/PostGIS.

| Было | Стало | Почему так проще |
|---|---|---|
| Классы с `@Injectable()`, DI через конструктор | Обычные функции, `require`/`import` напрямую | Не нужно понимать, что такое dependency injection, чтобы прочитать код |
| Guards (`@UseGuards`, `@Public()`) | Обычная middleware-функция `requireAuth(req, res, next)` | Видно прямо в файле роутов, какой путь чем защищён |
| Decorators на методах (`@Post()`, `@Body()`) | `router.post('/login', authController.login)` | Весь список путей — в одном читаемом файле |
| Модули (`@Module`, imports/exports/providers) | Модульность через файловую структуру | Меньше фреймворковой магии поверх обычного JS |
| Prisma + raw SQL для geo (`ST_DWithin`, `$queryRaw`) | Mongoose с `2dsphere`-индексом, `$near`/`$geoWithin` | Геозапросы — простые методы, без SQL |
| Cron-джоба на истечение TTL (`expire-stings.job.ts`) | Нативный TTL-индекс MongoDB | Документ удаляется сам, кода не нужно писать |

---

## 2. Структура проекта

```
sting-backend/
├── server.js                      # точка входа: подключение к БД → app.listen()
├── src/
│   ├── app.js                     # сборка Express-приложения
│   │
│   ├── config/
│   │   ├── db.js                  # подключение к MongoDB
│   │   └── env.js                 # чтение и валидация переменных окружения
│   │
│   ├── models/                    # Mongoose-схемы
│   │   ├── User.js
│   │   ├── RefreshToken.js
│   │   ├── Sting.js                # добавится на шаге "модуль stings"
│   │   └── Hive.js                 # добавится на шаге "модуль stings"
│   │
│   ├── routes/                    # только объявление путей
│   │   ├── auth.routes.js
│   │   ├── stings.routes.js        # следующий шаг
│   │   └── hives.routes.js         # следующий шаг
│   │
│   ├── controllers/               # разбирают req, вызывают services, формируют res
│   │   └── auth.controller.js
│   │
│   ├── services/                  # бизнес-логика
│   │   ├── auth.service.js
│   │   └── clustering.service.js   # следующий шаг
│   │
│   ├── middleware/
│   │   ├── auth.middleware.js      # проверка JWT
│   │   ├── error.middleware.js     # единый формат ошибок
│   │   └── validate.middleware.js  # обработка результатов express-validator
│   │
│   ├── validators/
│   │   └── auth.validators.js      # правила валидации тела запроса
│   │
│   ├── utils/
│   │   └── AppError.js             # класс ошибки с кодом/сообщением
│   │
│   └── sockets/
│       └── realtime.js             # Socket.io — следующий шаг
│
├── docker-compose.yml               # mongo для локальной разработки
├── .env.example
└── package.json
```

---

## 3. Слои и ответственность

| Слой | Ответственность |
|---|---|
| **routes** | Только маппинг `путь + HTTP-метод → middleware-цепочка → контроллер`. Ноль логики |
| **middleware** (validators + auth + error) | Проверки, не специфичные для конкретного эндпоинта: валидация тела, аутентификация, единый формат ошибки |
| **controllers** | Забирает данные из `req`, вызывает нужный `service`, формирует HTTP-ответ (`res.status().json()`). Не содержит бизнес-правил |
| **services** | Вся бизнес-логика: хеширование пароля, ротация refresh-токена, кластеризация ульев и т.д. Ничего не знает про `req`/`res` — их можно вызвать из теста напрямую |
| **models** | Mongoose-схемы: структура документа, индексы, валидация на уровне поля |

Поток запроса всегда идёт в одну сторону: `routes → middleware → controller → service → model`. Ошибка на любом шаге пробрасывается через `next(err)` до `error.middleware.js`, который всегда подключается последним в `app.js`.

---

## 4. Модели данных (Mongoose)

### 4.1 `User`

```js
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  username: { type: String, required: true, unique: true, trim: true },
  avatarUrl: { type: String, default: null },
}, { timestamps: true }); // createdAt/updatedAt — автоматически
```

### 4.2 `RefreshToken`

```js
const refreshTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash: { type: String, required: true, unique: true },
  deviceInfo: { type: String, default: null },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
}, { timestamps: { createdAt: 'issuedAt', updatedAt: false } });

refreshTokenSchema.index({ userId: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL
```

### 4.3 `Sting` (следующий шаг, ориентир на будущее)

```js
const stingSchema = new mongoose.Schema({
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  hiveId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hive', default: null },
  imageUrl: { type: String, required: true },
  thumbnailUrl: { type: String, required: true },
  location: {
    type: { type: String, enum: ['Point'], required: true },
    coordinates: { type: [Number], required: true }, // [lng, lat] — именно в этом порядке
  },
  accuracyM: { type: Number, default: null },
  capturedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  reactionsCount: { type: Number, default: 0 },
}, { timestamps: true });

stingSchema.index({ location: '2dsphere' });
stingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // автоудаление — TTL заменяет весь expire-джоб
stingSchema.index({ authorId: 1, createdAt: -1 });
stingSchema.index({ hiveId: 1 }, { sparse: true });
```

### 4.4 `Hive` (следующий шаг)

```js
const hiveSchema = new mongoose.Schema({
  center: {
    type: { type: String, enum: ['Point'], required: true },
    coordinates: { type: [Number], required: true },
  },
  radiusM: { type: Number, default: 150 },
  activeStingsCount: { type: Number, default: 0 },
}, { timestamps: true });

hiveSchema.index({ center: '2dsphere' });
```

---

## 5. Геозапросы

**Bounding box карты** (`GET /stings/nearby`):

```js
Sting.find({
  location: {
    $geoWithin: {
      $box: [
        [swLng, swLat],
        [neLng, neLat],
      ],
    },
  },
});
```

**Радиус от точки** (используется при кластеризации — "есть ли уже улей рядом"):

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

Оба запроса используют `2dsphere`-индекс автоматически — отдельно ничего оптимизировать не нужно, в отличие от ручных `ST_MakeEnvelope`/`ST_DWithin` в PostGIS-версии.

---

## 6. Кластеризация ульев

Логика остаётся той же, что была спроектирована для PostgreSQL (событийная, при каждой публикации), просто через Mongoose-запросы вместо raw SQL:

```
При публикации нового Sting:
  1. Ищем существующий Hive в радиусе HIVE_RADIUS_M от новой точки ($near)
     → нашли: attach hiveId, activeStingsCount += 1
  2. Не нашли:
     а. Считаем активные Sting без hiveId в радиусе HIVE_RADIUS_M ($geoWithin/$near)
     б. Если количество (включая новый) >= HIVE_ACTIVATION_THRESHOLD:
        создаём Hive с центром = центроид этих точек,
        присваиваем hiveId всем вовлечённым Sting разом
     в. Иначе — hiveId остаётся null
```

Реализуется как `clustering.service.js`, вызываемый из `stings.service.js` после сохранения нового жала — те же шаги 5.1, что были в предыдущей версии документа, просто без SQL-функций.

---

## 7. Истечение жал (TTL)

Самое существенное упрощение относительно PostgreSQL-версии: **не нужен `expire-stings.job.ts`, не нужен cron вообще**.

TTL-индекс на `expiresAt` (см. модель `Sting` выше) заставляет MongoDB самостоятельно физически удалить документ, когда наступает указанное время. Фоновый процесс MongoDB, отвечающий за это, проверяет коллекции примерно раз в 60 секунд — то есть реальное удаление может отстать от `expiresAt` на несколько десятков секунд. Для продукта, где "время жизни" и так не претендует на секундную точность (весь смысл — "около 4 часов"), это не проблема.

**Что по-прежнему нужно делать вручную:**
- Пересчёт `activeStingsCount` у ульев и удаление опустевших ульев — TTL удаляет только `Sting`, но не обновляет счётчик на связанном `Hive` и не удаляет сам `Hive`, если тот опустел. Для этого можно подписаться на MongoDB Change Streams (слушать удаления в коллекции `stings` и реагировать) — это следующий шаг при реализации модуля `hives`, отдельно опишем при написании кода.

---

## 8. Реальное время (WebSocket)

**Socket.io** (решено ранее) — критичен fallback на long-polling для нестабильного мобильного интернета.

Логика та же, что в предыдущей версии документа: клиент подписывается на bbox своей области карты (`subscribe:region`), сервер хранит маппинг `socketId → bbox` **в памяти процесса** (`Map`), не в Redis — при одном инстансе распределённое состояние не нужно. Как только появится необходимость в нескольких инстансах — это первое, что переезжает в Redis (см. таблицу апгрейда в разделе 9.4 предыдущей версии документа — тот же принцип действует и здесь).

---

## 9. Инфраструктура и деплой

Контекст не изменился: один разработчик, минимальный бюджет.

### 9.1 Хостинг API

**Railway или Render** — как и раньше: простое развёртывание из Git, поддержка long-lived WebSocket-соединений без ручной настройки балансировщика, usage-based тарификация.

### 9.2 База данных

**MongoDB Atlas, бесплатный тариф M0** — управляемый MongoDB-кластер с 512MB хранилища, этого достаточно на весь период разработки и раннего тестирования. Не нужно самостоятельно администрировать MongoDB (бэкапы, апдейты) — важно при одном разработчике. При росте — апгрейд тарифа Atlas без смены кода (просто меняется `MONGO_URI`).

### 9.3 Хранилище фото

Без изменений от предыдущей версии — **Cloudflare R2** (S3-совместимый API, без платы за egress).

### 9.4 Что убрано из инфраструктуры

Redis по-прежнему не используется на этом этапе — теперь по двум причинам одновременно: один инстанс (как и раньше) **и** TTL/очистка теперь встроены в саму БД, а не требуют отдельной очереди задач.

---

## 10. Что теряем при переходе с PostgreSQL/PostGIS

Честно про компромиссы, чтобы решение было осознанным:

- **Точность TTL** — MongoDB удаляет документ по TTL-индексу с задержкой до ~60 секунд, Postgres-версия с explicit cron была точнее (задержка = интервал джобы, тоже ~60с на практике — то есть на деле разница небольшая).
- **Сложная геоаналитика** — PostGIS умеет полигоны, пересечения сложных форм, топологические операции. MongoDB geospatial (`2dsphere`) прекрасно покрывает "точка в радиусе"/"точка в bbox", что нам и нужно, но не годится, если в будущем понадобится что-то сложнее (например, "жала внутри границ конкретного района города" по произвольному полигону — тоже вообще-то поддерживается через `$geoWithin` с `$geometry` полигоном, так что и это не жёсткое ограничение).
- **Строгая схема и внешние ключи** — Postgres/Prisma гарантируют целостность на уровне БД (нельзя вставить `Sting` с несуществующим `authorId`). MongoDB такого не проверяет сама — целостность нужно поддерживать в коде сервисов (что мы и делаем, но это ответственность разработчика, не БД).
- **Транзакции** — MongoDB поддерживает multi-document transactions, но менее естественно, чем Postgres; для текущей модели данных (публикация жала — по сути одна операция записи) это не создаёт проблем.

Ничего из этого не блокирует проект на текущем масштабе — но стоит держать в голове, если продукт вырастет в сторону куда более сложной геологики.
