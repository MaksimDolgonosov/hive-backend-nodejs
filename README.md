# Sting App — Backend

Node.js + Express + TypeScript + MongoDB API для мобильного приложения «Улей».

**Статус:** MVP backend реализован (auth, stings, hives, WebSocket, анти-спуфинг). Следующий шаг — [production deploy](./BACKEND_ARCHITECTURE.md#12-инфраструктура-и-деплой).

## Документация

| Файл | Содержание |
|------|------------|
| [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md) | Архитектура, модели, кластеризация, WS, деплой |
| [TECH_DOCS.md](./TECH_DOCS.md) | Контракты API/WS для frontend |
| [openapi.yaml](./openapi.yaml) | OpenAPI 3.0 спецификация |

## Требования

- **Node.js** 20+
- **npm** 10+
- **Docker Desktop** (для локальной MongoDB)

## Быстрый старт

### 1. Клонировать репозиторий

```bash
git clone <url-репозитория>
cd hive-backend-nodejs
```

### 2. Установить зависимости

```bash
npm install
```

### 3. Настроить переменные окружения

```bash
cp .env.example .env
```

На Windows (PowerShell):

```powershell
Copy-Item .env.example .env
```

Открой `.env` и при необходимости измени `JWT_ACCESS_SECRET` на любую случайную строку.

> Файл `.env` не коммитится в Git — у каждого разработчика свой локальный экземпляр.

### 4. Поднять MongoDB в Docker

```bash
docker compose up -d
```

Проверить, что контейнер запущен:

```bash
docker ps
```

Должен быть контейнер `sting-mongo` со статусом `healthy`.

**Важно:** MongoDB в Docker слушает порт **27018**, а не стандартный 27017. На Windows часто уже установлена локальная служба MongoDB на 27017 — из‑за этого Compass/API могут подключаться не к тому серверу.

> **Change Streams** (мгновенная очистка ульев при TTL) требуют replica set — он есть на **MongoDB Atlas**. Локально Docker MongoDB работает в standalone-режиме: сервер автоматически запускает **периодический пересчёт ульев** (по умолчанию каждые 60 с). Задержка та же, что у TTL MongoDB (~60 с).

### 5. Запустить API-сервер

Режим разработки (hot-reload):

```bash
npm run dev
```

Продакшн-сборка:

```bash
npm run build
npm start
```

После запуска в консоли должно появиться:

```
MongoDB подключена
Socket.io: /ws (websocket + polling)
Сервер запущен на порту 3000
```

API: **http://localhost:3000/api/v1**  
WebSocket: **http://localhost:3000/ws?token=accessToken**

## API (краткий обзор)

Префикс: `/api/v1`. Все эндпоинты, кроме register/login/refresh, требуют `Authorization: Bearer <accessToken>`.

### Auth

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/auth/register` | Регистрация |
| POST | `/auth/login` | Вход |
| POST | `/auth/refresh` | Обновление access-токена |
| POST | `/auth/logout` | Отзыв refresh-токена |
| GET | `/auth/me` | Текущий пользователь |
| POST | `/auth/me/avatar` | Загрузка аватара (multipart, поле `avatar`) |
| DELETE | `/auth/me/avatar` | Удаление аватара |

### Stings

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/stings/nearby` | Жала и ульи в bbox карты |
| POST | `/stings` | Публикация жала (multipart) |
| GET | `/stings/:id` | Одно жало |
| DELETE | `/stings/:id` | Удаление своего жала |
| POST | `/stings/:id/reactions` | Реакция `{ "type": "like" }` |

### Hives

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/hives/:id` | Улей + список жал |
| GET | `/hives/:id/stings` | Пагинированный список жал |

## WebSocket

Подключение через **socket.io-client** (не обычный HTTP URL).

После connect отправь подписку на регион:

```json
{ "type": "subscribe:region", "payload": { "swLat": 53.9, "swLng": 30.3, "neLat": 54.0, "neLng": 30.4 } }
```

События сервера — на канале `message`: `{ "type": "sting:created", "payload": { ... } }`.

### Быстрая проверка из терминала

```powershell
# PowerShell — без угловых скобок вокруг токена
npm run ws:test -- eyJhbGciOiJIUzI1NiIs...
```

Или через `.env`:

```powershell
$env:WS_TEST_TOKEN="eyJ..."
npm run ws:test
```

Опционально — bbox: `WS_TEST_SW_LAT`, `WS_TEST_SW_LNG`, `WS_TEST_NE_LAT`, `WS_TEST_NE_LNG`.

## Проверка REST

### Регистрация

```powershell
curl -X POST http://localhost:3000/api/v1/auth/register `
  -H "Content-Type: application/json" `
  -d '{"email":"dev@example.com","password":"password123","username":"devuser"}'
```

### Текущий пользователь

```powershell
curl http://localhost:3000/api/v1/auth/me `
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

### Загрузка аватара

```powershell
curl -X POST http://localhost:3000/api/v1/auth/me/avatar `
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." `
  -F "avatar=@C:\path\to\photo.jpg"
```

`accessToken` берётся из ответа `/auth/register` или `/auth/login`.

## Переменные окружения

Полный список — в [`.env.example`](./.env.example). Основные:

| Переменная | Назначение |
|------------|------------|
| `MONGO_URI` | Строка подключения MongoDB |
| `JWT_ACCESS_SECRET` | Секрет для access JWT |
| `BASE_URL` | Публичный URL API (для URL фото при `STORAGE_DRIVER=local`) |
| `STORAGE_DRIVER` | `local` или `r2` |
| `HIVE_RADIUS_M` | Радиус кластеризации (150) |
| `HIVE_ACTIVATION_THRESHOLD` | Порог создания улья (3) |
| `STING_RATE_LIMIT_MAX` | Лимит публикаций в час (10) |

## MongoDB Compass

```
mongodb://sting:sting_dev_password@localhost:27018/sting_app?authSource=admin
```

База: **`sting_app`**

| Коллекция | Содержимое |
|-----------|------------|
| `users` | Пользователи |
| `refreshtokens` | Refresh-токены |
| `stings` | Жала |
| `hives` | Ульи (кластеры) |

## Полезные команды

| Команда | Описание |
|---------|----------|
| `npm run dev` | Запуск с hot-reload |
| `npm run ws:test -- <token>` | Проверка Socket.io |
| `npm run build` | Компиляция TypeScript → `dist/` |
| `npm start` | Запуск production-сборки |
| `docker compose up -d` | Запустить MongoDB |
| `docker compose down` | Остановить MongoDB |

## Структура проекта

```
server.ts                 # Точка входа
scripts/ws-test.ts        # Тест WebSocket
src/
  app.ts                  # Express-приложение
  config/                 # env, db
  models/                 # User, RefreshToken, Sting, Hive
  routes/                 # auth, stings, hives
  controllers/
  services/               # бизнес-логика, storage, validation
  middleware/             # auth, upload, rate-limit, errors
  validators/
  sockets/realtime.ts     # Socket.io
  types/
  utils/
uploads/                  # Локальное хранилище (dev)
docker-compose.yml
openapi.yaml
```

## Частые проблемы

### `Authentication failed` в Compass

Подключайся к порту **27018**, не 27017.

### `EADDRINUSE` — порт 3000 занят

Измени `PORT` в `.env` или останови процесс, занимающий порт.

### `Ошибка в синтаксисе команды` (PowerShell)

Не оборачивай токен в `<` и `>` — это перенаправление в PowerShell. Передавай токен как обычный аргумент.

### Docker не запускается

Убедись, что Docker Desktop запущен. На Windows может потребоваться WSL2.

### Локальная MongoDB на порту 27017

Если установлен MongoDB Server как служба Windows — это нормально. Проект использует Docker на **27018** и не конфликтует с ней.
