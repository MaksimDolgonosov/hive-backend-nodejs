# Sting App — Техническая документация

Версия: 0.1 (draft)
Аудитория: команда разработки (frontend RN + backend)

---

## Содержание

1. [Архитектура и модули](#1-архитектура-и-модули)
2. [Модели данных](#2-модели-данных)
3. [API контракты](#3-api-контракты)
   - [3.1 Auth](#31-auth)
   - [3.2 Stings](#32-stings)
   - [3.3 Hives](#33-hives)
4. [WebSocket](#4-websocket)
5. [Общие соглашения](#5-общие-соглашения)

---

## 1. Архитектура и модули

### 1.1 `app/` — Expo Router (file-based routing)

Отвечает только за композицию экранов и навигацию. Не содержит бизнес-логики — экраны импортируют хуки/компоненты из `src/` и просто их компонуют.

| Путь | Назначение |
|---|---|
| `app/_layout.tsx` | Корневой layout: подключение провайдеров (React Query, Zustand hydration, тема), auth-guard (редирект на `(onboarding)` или `(tabs)` в зависимости от состояния `authStore`) |
| `app/(tabs)/_layout.tsx` | Таб-бар с тремя вкладками: Карта / Рядом / Профиль |
| `app/(tabs)/index.tsx` | Экран карты — рендерит `MapContainer`, подписан на `mapStore` и `useStingsNearby` |
| `app/(tabs)/nearby.tsx` | Лента ближайших жал списком (альтернатива карте для плохого GPS/предпочтений) |
| `app/(tabs)/profile.tsx` | Профиль, настройки, выход |
| `app/(modals)/_layout.tsx` | Stack-навигатор с `presentation: 'modal'` для camera/preview/sting-detail |
| `app/(modals)/camera.tsx` | Полноэкранная камера |
| `app/(modals)/preview.tsx` | Просмотр снятого фото перед публикацией + подтверждение |
| `app/(modals)/sting/[id].tsx` | Детальный просмотр одного жала по id |
| `app/(onboarding)/*` | Линейный флоу из 3 шагов, показывается один раз (флаг в `authStore`/AsyncStorage) |

**Auth-guard**: логика в корневом `_layout.tsx` — читает `authStore.status` (`idle | authenticated | unauthenticated`) и вызывает `router.replace()` соответственно. Экраны `(tabs)` и `(modals)` не должны сами проверять авторизацию.

### 1.2 `src/api/` — HTTP/WS клиент

| Файл | Назначение |
|---|---|
| `client.ts` | Единственный `axios.create()` инстанс. Interceptor на request — подставляет `Authorization: Bearer <accessToken>` из `authStore`. Interceptor на response 401 — пытается `refreshToken`, при неудаче — logout. Базовый URL из `app.json` → `extra.apiUrl` |
| `auth.ts` | Обёртки над эндпоинтами `/auth/*` (см. раздел 3.1) |
| `stings.ts` | Обёртки над `/stings/*` (см. 3.2) |
| `hives.ts` | Обёртки над `/hives/*` (см. 3.3) |
| `websocket.ts` | Синглтон-менеджер сокета: `connect()`, `disconnect()`, `subscribe(event, cb)`, авто-reconnect с экспоненциальным backoff, ре-подписка на регион карты при reconnect |

Каждый файл экспортирует только async-функции, возвращающие уже типизированные данные (не `AxiosResponse`) — форма ответа описана в разделе 3.

### 1.3 `src/components/`

| Модуль | Назначение |
|---|---|
| `map/MapContainer.tsx` | Обёртка над `react-native-maps`. Держит `region`, дебаунсит изменение региона (300мс) и триггерит `useStingsNearby` с новыми bounds. Рендерит `StingMarker`/`HiveCircle` из полученных данных |
| `map/StingMarker.tsx` | Одиночный пин. Цвет/прозрачность зависят от `expiresAt` (см. `useCountdown`) |
| `map/HiveCircle.tsx` | Кластерный маркер. Размер/пульсация зависят от `photoCount`. При тапе — открывает `HiveBottomSheet` через `mapStore.selectedHiveId` |
| `camera/CameraView.tsx` | Обёртка над `expo-camera`. Не содержит UI кнопок — только видоискатель + permission-стейт |
| `camera/CaptureButton.tsx` | Кнопка затвора. На `onPress` — haptic (`utils/haptics.ts`) + вызывает `useCamera().capture()` |
| `ui/Timer.tsx` | Презентационный компонент обратного отсчёта, принимает `expiresAt`, сам ничего не запрашивает (использует `useCountdown` внутри) |
| `ui/Avatar.tsx` | Аватар пользователя с фоллбеком на инициалы |
| `ui/HiveBottomSheet.tsx` | Bottom sheet со списком фото улья. Данные — через `useQuery(['hive', id])` |
| `feed/NearbyCard.tsx` | Карточка для `nearby.tsx` — превью, дистанция, таймер |

### 1.4 `src/hooks/`

| Хук | Назначение |
|---|---|
| `useLocation.ts` | Обёртка над `expo-location`. Возвращает `{ coords, accuracy, status }`, следит за permission, при `accuracy > 50м` возвращает флаг `isLowAccuracy` для UI-предупреждения перед публикацией |
| `useStingsNearby.ts` | React Query hook: `useQuery(['stings', bounds], () => stings.getNearby(bounds))`. `staleTime` короткий (30с), т.к. данные "живые"; инвалидируется также WS-событием `sting:created`/`sting:expired` |
| `useCamera.ts` | Инкапсулирует запрос permissions, вызов `expo-camera`, запись временного файла, передачу его в `cameraStore` |
| `useCountdown.ts` | `(expiresAt: string) => { remainingMs, remainingLabel, isExpired }`. Обновляется через `setInterval` 1 раз/сек, останавливается при `isExpired` |

### 1.5 `src/stores/` (Zustand)

| Store | Состояние |
|---|---|
| `authStore.ts` | `user`, `accessToken`, `refreshToken`, `status`, `hasCompletedOnboarding`. Персистится в `expo-secure-store` (токены) / AsyncStorage (флаг онбординга) |
| `mapStore.ts` | `region`, `selectedHiveId`, `selectedStingId` — чисто UI-состояние карты, не серверные данные (те — в React Query кэше) |
| `cameraStore.ts` | `capturedUri`, `captureCoords`, `captureAccuracy` — временное состояние между `camera.tsx` и `preview.tsx`, очищается после публикации или отмены |

**Принцип разделения:** серверные данные (жала, ульи, профиль) живут в React Query. Zustand — только для эфемерного клиентского UI-состояния и авторизации. Это исключает дублирование источника истины.

### 1.6 `src/utils/`

| Файл | Назначение |
|---|---|
| `geo.ts` | `haversineDistance(a, b)`, `isWithinRadius(point, center, radiusM)` — используется для клиентской проверки перед отправкой (сервер всегда перепроверяет) |
| `validation.ts` | Клиентские проверки перед аплоадом: свежесть EXIF-таймстампа фото относительно текущего момента (защита от re-upload старых фото), проверка что файл пришёл из `capturedUri` камеры, а не из document picker. **Это только UX-предупреждение** — авторитетная проверка анти-спуфинга обязана быть на сервере (см. 5.3) |
| `haptics.ts` | Именованные паттерны (`impactCapture`, `notifyPublishSuccess`) поверх `expo-haptics`, чтобы не разбрасывать сырые вызовы по компонентам |

### 1.7 `src/types/index.ts`

Общие типы, зеркалящие серверные DTO из раздела 2 (`Sting`, `Hive`, `User`, `AuthTokens`, пагинированные обёртки). Рекомендуется генерировать их из OpenAPI-схемы бэкенда, а не поддерживать вручную вторым источником истины.

---

## 2. Модели данных

```ts
type UUID = string; // v4

interface User {
  id: UUID;
  username: string;
  avatarUrl: string | null;
  createdAt: string; // ISO 8601
}

interface Sting {
  id: UUID;
  authorId: UUID;
  imageUrl: string;
  thumbnailUrl: string;
  location: {
    lat: number;
    lng: number;
  };
  hiveId: UUID | null;      // null, если пока одиночное
  createdAt: string;        // ISO 8601
  expiresAt: string;        // ISO 8601, createdAt + 4h
  reactionsCount: number;
}

interface Hive {
  id: UUID;
  center: { lat: number; lng: number };
  radiusM: number;
  activeStingsCount: number;
  createdAt: string;
  updatedAt: string;
}

interface AuthTokens {
  accessToken: string;   // JWT, TTL ~15 мин
  refreshToken: string;  // TTL ~30 дней
  expiresAt: string;     // ISO 8601, срок действия accessToken
}
```

---

## 3. API контракты

Базовый префикс: `/api/v1`. Формат: JSON. Аутентификация — `Authorization: Bearer <accessToken>` для всех эндпоинтов, кроме `/auth/register`, `/auth/login`, `/auth/refresh`.

Единый формат ошибки:

```json
{
  "error": {
    "code": "STING_LOCATION_MISMATCH",
    "message": "Координаты фото не совпадают с текущим местоположением",
    "details": {}
  }
}
```

### 3.1 Auth

#### `POST /auth/register`
```json
// Request
{ "email": "user@example.com", "password": "string", "username": "string" }

// Response 201
{ "user": User, "tokens": AuthTokens }
```

#### `POST /auth/login`
```json
// Request
{ "email": "user@example.com", "password": "string" }

// Response 200
{ "user": User, "tokens": AuthTokens }

// Response 401
{ "error": { "code": "INVALID_CREDENTIALS", "message": "..." } }
```

#### `POST /auth/refresh`
```json
// Request
{ "refreshToken": "string" }

// Response 200
{ "tokens": AuthTokens }

// Response 401 — refresh истёк или отозван, клиент обязан разлогинить пользователя
```

#### `POST /auth/logout`
```json
// Request
{ "refreshToken": "string" }

// Response 204
```

#### `GET /auth/me`
```json
// Response 200
{ "user": User }
```

---

### 3.2 Stings

#### `GET /stings/nearby`
Запрос жал в пределах видимой области карты. Возвращает только **активные** (не истёкшие) жала; истёкшие сервер не отдаёт вовсе.

```
Query params:
  swLat, swLng, neLat, neLng   — bounding box видимой карты (обязательные)
```

```json
// Response 200
{
  "stings": Sting[],
  "hives": Hive[]
}
```

> Сервер сам решает кластеризацию: жала, попавшие в `hiveId`, не дублируются как отдельные точки на карте — клиент рендерит `HiveCircle` вместо набора `StingMarker`.

#### `POST /stings`
Публикация нового жала. **Только multipart** — фото передаётся файлом, не base64/URL.

```
Content-Type: multipart/form-data

fields:
  photo: File (jpeg)
  lat: number
  lng: number
  accuracy: number          // метры, точность GPS в момент съёмки
  capturedAt: string        // ISO 8601, клиентский таймстамп съёмки
```

```json
// Response 201
{ "sting": Sting }

// Response 422 — не прошла серверная анти-спуфинг проверка
{
  "error": {
    "code": "STING_VALIDATION_FAILED",
    "message": "Фото не прошло проверку подлинности",
    "details": { "reason": "EXIF_MISMATCH" }
  }
}

// Response 429 — rate limit (защита от спама публикаций)
{ "error": { "code": "RATE_LIMITED", "message": "Слишком много публикаций, попробуйте позже" } }
```

#### `GET /stings/:id`
```json
// Response 200
{ "sting": Sting }

// Response 404 — жало истекло и было удалено, либо не существует
{ "error": { "code": "STING_NOT_FOUND", "message": "..." } }
```

#### `DELETE /stings/:id`
Удаление собственного жала до истечения TTL. Только автор.

```
// Response 204
// Response 403 — попытка удалить чужое жало
```

#### `POST /stings/:id/reactions`
```json
// Request
{ "type": "like" }

// Response 200
{ "reactionsCount": 14 }
```

---

### 3.3 Hives

#### `GET /hives/:id`
```json
// Response 200
{
  "hive": Hive,
  "stings": Sting[]   // отсортированы по createdAt desc
}
```

#### `GET /hives/:id/stings`
Отдельный пагинированный эндпоинт — используется, если в улье может быть много фото и весь список получать сразу нецелесообразно.

```
Query params: cursor?: string, limit?: number (default 20, max 50)
```

```json
// Response 200
{
  "stings": Sting[],
  "nextCursor": "string | null"
}
```

---

## 4. WebSocket

Подключение: `wss://<host>/ws?token=<accessToken>`. Один сокет на клиента, менеджер — `src/api/websocket.ts`.

После подключения клиент обязан отправить подписку на регион карты (сервер не шлёт события вне подписанной области — иначе трафик не масштабируется):

```json
// Client → Server
{
  "type": "subscribe:region",
  "payload": { "swLat": 0, "swLng": 0, "neLat": 0, "neLng": 0 }
}
```

Регион переподписывается при каждом значимом смещении карты (тот же дебаунс 300мс, что и у `useStingsNearby`).

### События сервера

| Event | Payload | Когда |
|---|---|---|
| `sting:created` | `{ sting: Sting }` | Новое жало опубликовано в подписанном регионе |
| `sting:expired` | `{ stingId: UUID, hiveId: UUID \| null }` | Жало истекло по TTL (сервер, не клиентский таймер — источник истины) |
| `hive:updated` | `{ hive: Hive }` | Изменился `activeStingsCount` улья (новое жало вошло/старое истекло) |
| `hive:dissolved` | `{ hiveId: UUID }` | В улье не осталось активных жал — точка исчезает с карты |
| `sting:reaction` | `{ stingId: UUID, reactionsCount: number }` | Изменился счётчик реакций на открытом сейчас `sting/[id]` |

Формат едино для всех событий:

```json
{ "type": "sting:created", "payload": { /* ... */ } }
```

**Интеграция с React Query:** обработчики в `websocket.ts` не хранят собственное состояние — они вызывают `queryClient.setQueryData` / `invalidateQueries` для ключей `['stings', bounds]` и `['hive', id]`, чтобы WS был единственным источником realtime-обновлений, а компоненты не подписывались на сокет напрямую.

### Client → Server (кроме подписки)

| Event | Payload | Назначение |
|---|---|---|
| `unsubscribe:region` | `{}` | Отправляется при уходе с экрана карты (фоновый режим) для экономии трафика |
| `ping` | `{}` | Keepalive раз в 25с; сервер обязан ответить `pong` в течение 5с, иначе клиент считает соединение мёртвым и переподключается |

---

## 5. Общие соглашения

### 5.1 Формат времени
Всегда ISO 8601 UTC (`2026-07-27T14:30:00.000Z`). Форматирование в локальное время — только на клиенте.

### 5.2 Пагинация
Курсорная (не offset-based) везде, где применимо — данные "живые" и постоянно меняются, offset даёт дубликаты/пропуски.

### 5.3 Анти-спуфинг публикации (сервер — источник истины)
Клиентские проверки в `utils/validation.ts` — это только немедленная обратная связь пользователю. Сервер обязан независимо:
- сверять `capturedAt` из запроса с временем получения запроса (окно допуска, например ±2 минуты);
- сверять `lat/lng` из запроса с точностью GPS (`accuracy`), отклонять при подозрительно идеальных координатах;
- по возможности сверять EXIF-метаданные исходного файла с заявленными координатами/временем.

Ни одна из этих проверок не должна приниматься "на веру" от клиента.

### 5.4 Идемпотентность публикации
`POST /stings` должен поддерживать заголовок `Idempotency-Key` (UUID, генерируется клиентом при старте публикации) — на случай повторной отправки при обрыве связи, чтобы не создавать дубликат жала.

### 5.5 Версионирование API
Префикс `/api/v1` фиксирован на MVP. Breaking changes — только через `/api/v2`, без изменения поведения `v1` до его вывода из эксплуатации.
