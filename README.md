# Sting App — Backend

Node.js + Express + TypeScript + MongoDB API для мобильного приложения «Улей».

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
Сервер запущен на порту 3000
```

API доступен по адресу: **http://localhost:3000**

## Проверка, что всё работает

### Регистрация пользователя

```bash
curl -X POST http://localhost:3000/api/v1/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"dev@example.com\",\"password\":\"password123\",\"username\":\"devuser\"}"
```

На macOS / Linux замените `^` на `\`.

### Текущий пользователь

```bash
curl http://localhost:3000/api/v1/auth/me ^
  -H "Authorization: Bearer <accessToken>"
```

`accessToken` берётся из ответа `/auth/register` или `/auth/login`.

## MongoDB Compass

Строка подключения:

```
mongodb://sting:sting_dev_password@localhost:27018/sting_app?authSource=admin
```

База данных: **`sting_app`**

Коллекции после работы с API:

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
| `npm run build` | Компиляция TypeScript → `dist/` |
| `npm start` | Запуск скомпилированного сервера |
| `docker compose up -d` | Запустить MongoDB |
| `docker compose down` | Остановить MongoDB |
| `docker compose logs mongo` | Логи MongoDB |

## Структура проекта

```
server.ts              # Точка входа
src/
  app.ts               # Express-приложение
  config/              # env, подключение к БД
  models/              # Mongoose-схемы
  routes/              # Маршруты
  controllers/         # HTTP-слой
  services/            # Бизнес-логика
  middleware/          # auth, errors, upload
  validators/          # express-validator
uploads/               # Локальное хранилище фото (dev)
docker-compose.yml     # MongoDB для разработки
openapi.yaml           # Спецификация API
```

Подробнее об архитектуре — в [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md).

## Частые проблемы

### `Authentication failed` в Compass

Подключайся к порту **27018**, не 27017.

### `EADDRINUSE` — порт 3000 занят

Измени `PORT` в `.env` или останови процесс, занимающий порт.

### Docker не запускается

Убедись, что Docker Desktop запущен. На Windows может потребоваться включить WSL2.

### Локальная MongoDB на порту 27017

Если установлен MongoDB Server как служба Windows — это нормально. Проект использует Docker на **27018** и не конфликтует с ней.
