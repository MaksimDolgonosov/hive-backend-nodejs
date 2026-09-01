# Backend — ТЗ: идентификация по email (OTP) и восстановление пароля

Версия: 1.0  
Стек: Node.js + Express + MongoDB (как в текущем backend)  
Контракты frontend: `RN_FRONTEND_TZ.md` → раздел 7 «Идентификация по email (OTP) и восстановление пароля»  
Связанные документы: `openapi.yaml`, `TECH_DOCS.md`

---

## Содержание

1. [Цель и границы](#1-цель-и-границы)
2. [Модель данных](#2-модель-данных)
3. [Правила OTP](#3-правила-otp)
4. [Почтовый сервис](#4-почтовый-сервис)
5. [Эндпоинты API](#5-эндпоинты-api)
6. [Коды ошибок](#6-коды-ошибок)
7. [Безопасность и rate limit](#7-безопасность-и-rate-limit)
8. [Пошаговый план реализации](#8-пошаговый-план-реализации)
9. [Definition of Done](#9-definition-of-done)

---

## 1. Цель и границы

Backend обязан:

1. При регистрации создавать пользователя в статусе `pending`, отправлять 6-значный OTP на email и выдавать сессию только после успешной верификации кода.
2. При входе отклонять неподтверждённые аккаунты (`EMAIL_NOT_VERIFIED`) и позволять повторно запросить код.
3. Реализовать восстановление пароля: запрос OTP → проверка кода → установка нового пароля.

Вне скоупа этого ТЗ: смена email у уже подтверждённого пользователя, magic-link (вход только по ссылке), SMS-OTP.

---

## 2. Модель данных

### 2.1. User (изменения)

| Поле | Тип | Описание |
| ---- | --- | -------- |
| `email` | string, unique, lowercase | Идентификатор входа |
| `passwordHash` | string | bcrypt/argon2 |
| `username` | string, unique | Отображаемое имя |
| `emailVerified` | boolean, default `false` | Подтверждён ли email |
| `status` | `pending` \| `active` \| `disabled` | `pending` до верификации |

После успешной верификации: `emailVerified = true`, `status = active`.

### 2.2. EmailOtpChallenge

Отдельная коллекция/таблица одноразовых кодов (не хранить plaintext-код дольше TTL).

| Поле | Тип | Описание |
| ---- | --- | -------- |
| `id` | ObjectId/UUID | |
| `userId` | ObjectId/UUID, nullable | Для register/verify; для reset может быть найден по email |
| `email` | string, lowercase | Кому выслан код |
| `purpose` | `register` \| `password_reset` | Назначение challenge |
| `codeHash` | string | Хэш 6-значного кода (не plaintext) |
| `expiresAt` | Date | Момент истечения |
| `attempts` | number | Число неудачных проверок |
| `consumedAt` | Date \| null | Когда код успешно использован |
| `createdAt` | Date | |
| `lastSentAt` | Date | Для cooldown повторной отправки |

Индексы:

- `{ email: 1, purpose: 1, consumedAt: 1 }`
- TTL-индекс по `expiresAt` (автоочистка просроченных документов, опционально).

Правило: при создании нового challenge для той же пары `(email, purpose)` все предыдущие активные challenge помечаются `consumedAt` (или удаляются), чтобы действовал только последний код.

---

## 3. Правила OTP

| Параметр | Значение | Комментарий |
| -------- | -------- | ----------- |
| Длина кода | 6 цифр | `000000`–`999999`, генерация crypto-random |
| TTL | 10 минут | После — `OTP_EXPIRED` |
| Max attempts | 5 на один challenge | После — `OTP_MAX_ATTEMPTS`, challenge инвалидируется |
| Cooldown resend | 60 секунд | `OTP_RESEND_COOLDOWN` |
| Max resend / час | 5 на email+purpose | `OTP_RATE_LIMITED` |
| Хранение | только `codeHash` | Сравнение через безопасный hash-compare |

Генерация: криптостойкий RNG (не `Math.random`). В письме — plaintext код; в БД — только хэш.

---

## 4. Почтовый сервис

Абстракция `EmailService.sendOtpEmail({ to, code, purpose, locale? })`.

Требования:

- Провайдер (SendGrid / Resend / Amazon SES / SMTP) — через env (`SMTP_*` или API-ключ).
- Шаблоны писем: отдельно для `register` и `password_reset`.
- Тема/тело на русском и английском (если frontend передаёт `Accept-Language` или `locale` — использовать; иначе default `ru`/`en` по конфигу).
- В dev-режиме допускается лог кода в консоль **только** при `NODE_ENV !== production` и флаге `OTP_DEV_LOG=true`.
- Ошибка доставки почты не должна оставлять «зомби»-пользователя без возможности resend: challenge создаётся, ответ API успешен, повторная отправка доступна после cooldown. Если критично — транзакционно откатывать регистрацию при фатальной ошибке провайдера (выбрать один подход и зафиксировать в реализации).

Рекомендуемый текст (register):

> Код подтверждения Hive: **123456**. Действует 10 минут.

Рекомендуемый текст (password_reset):

> Код для сброса пароля Hive: **123456**. Если вы не запрашивали сброс — игнорируйте письмо.

---

## 5. Эндпоинты API

Базовый префикс: `/api/v1`. Формат ошибок: `{ error: { code, message, details? } }`.

Публичные (без Bearer): все ниже, кроме явно отмеченных.

### 5.1. `POST /auth/register`

**Request**

```json
{
  "email": "user@example.com",
  "password": "string",
  "username": "string"
}
```

**Поведение**

1. Валидация email/password/username (password ≥ 8 символов).
2. Если email уже есть и `emailVerified=true` → `409 USER_ALREADY_EXISTS`.
3. Если email есть, `emailVerified=false` → обновить `passwordHash`/`username` (или вернуть тот же pending-аккаунт), создать новый OTP `purpose=register`, отправить письмо.
4. Если email новый → создать User (`pending`, `emailVerified=false`), OTP, письмо.
5. **Не** выдавать `tokens` на этом шаге.

**Response 201**

```json
{
  "status": "otp_required",
  "email": "user@example.com",
  "purpose": "register",
  "expiresInSec": 600,
  "resendAvailableInSec": 60
}
```

---

### 5.2. `POST /auth/otp/verify`

Подтверждение кода регистрации → активация аккаунта + выдача сессии.

**Request**

```json
{
  "email": "user@example.com",
  "code": "123456",
  "purpose": "register"
}
```

Для `purpose=register` только.

**Response 200**

```json
{
  "user": { "...": "User" },
  "tokens": {
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

Побочные эффекты: `emailVerified=true`, `status=active`, challenge `consumedAt=now`.

---

### 5.3. `POST /auth/otp/resend`

**Request**

```json
{
  "email": "user@example.com",
  "purpose": "register" | "password_reset"
}
```

**Поведение**

- Проверить cooldown и rate limit.
- Инвалидировать предыдущий активный challenge.
- Создать новый код, отправить письмо.
- Ответ всегда одинаковый по форме успеха (не раскрывать лишнее).

**Response 200**

```json
{
  "status": "otp_sent",
  "email": "user@example.com",
  "purpose": "register",
  "expiresInSec": 600,
  "resendAvailableInSec": 60
}
```

Для `password_reset`: даже если email не найден — возвращать **тот же** успешный ответ (anti-enumeration), письмо не слать.

---

### 5.4. `POST /auth/login` (изменение поведения)

Если credentials верны, но `emailVerified=false`:

**Response 403**

```json
{
  "error": {
    "code": "EMAIL_NOT_VERIFIED",
    "message": "Email is not verified",
    "details": {
      "email": "user@example.com",
      "purpose": "register"
    }
  }
}
```

Frontend по этому коду открывает экран ввода OTP и может вызвать `/auth/otp/resend`.

---

### 5.5. `POST /auth/password/forgot`

**Request**

```json
{ "email": "user@example.com" }
```

**Поведение**

1. Нормализовать email.
2. Если пользователь существует и `emailVerified=true` — создать OTP `purpose=password_reset`, отправить письмо.
3. Если пользователя нет / не верифицирован — **не** раскрывать: тот же успешный ответ без письма (или с логом на сервере).

**Response 200**

```json
{
  "status": "otp_sent",
  "email": "user@example.com",
  "purpose": "password_reset",
  "expiresInSec": 600,
  "resendAvailableInSec": 60
}
```

---

### 5.6. `POST /auth/password/reset`

Два варианта контракта (выбрать один и зафиксировать в `openapi.yaml`):

**Вариант A (рекомендуемый, один запрос):**

```json
{
  "email": "user@example.com",
  "code": "123456",
  "newPassword": "string"
}
```

**Вариант B (два шага):** сначала `POST /auth/otp/verify` с `purpose=password_reset` → короткоживущий `resetToken`, затем `POST /auth/password/reset` с `resetToken` + `newPassword`.

Рекомендация для MVP: **Вариант A**.

**Поведение (A)**

1. Найти активный challenge `password_reset` по email.
2. Проверить TTL и attempts.
3. Сверить код.
4. Обновить `passwordHash`, `consumedAt=now`.
5. Отозвать все refresh-токены пользователя (принудительный logout на других устройствах).
6. Опционально сразу выдать новую сессию **или** вернуть 204 и заставить логиниться заново. Для UX frontend предпочтительнее выдать сессию.

**Response 200** (если выдаём сессию)

```json
{
  "user": { "...": "User" },
  "tokens": { "accessToken": "...", "refreshToken": "..." }
}
```

**Response 204** — если сессию не выдаём (тогда frontend → экран login).

---

### 5.7. Существующие эндпоинты без изменений контракта

- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

Обновить `openapi.yaml` и `TECH_DOCS.md` раздел 3.1.

---

## 6. Коды ошибок

| HTTP | `error.code` | Когда |
| ---- | ------------ | ----- |
| 400 | `VALIDATION_ERROR` | Невалидный email/password/code |
| 401 | `INVALID_CREDENTIALS` | Неверный email/password на login |
| 403 | `EMAIL_NOT_VERIFIED` | Login при неподтверждённом email |
| 404 | `OTP_NOT_FOUND` | Нет активного challenge (опционально; можно маскировать как `OTP_INVALID`) |
| 409 | `USER_ALREADY_EXISTS` | Email уже верифицирован |
| 429 | `OTP_RATE_LIMITED` | Превышен лимит отправок |
| 429 | `OTP_RESEND_COOLDOWN` | Слишком рано для resend (`details.retryAfterSec`) |
| 400 | `OTP_INVALID` | Неверный код |
| 400 | `OTP_EXPIRED` | Код просрочен |
| 400 | `OTP_MAX_ATTEMPTS` | Исчерпаны попытки |
| 500 | `EMAIL_SEND_FAILED` | Провайдер почты недоступен (для ops; клиенту лучше мягкий retry) |

`details` для cooldown/rate limit:

```json
{ "retryAfterSec": 42 }
```

---

## 7. Безопасность и rate limit

1. **Anti-enumeration**: ответы `forgot` / `resend(password_reset)` одинаковы для существующих и несуществующих email.
2. **Хэш пароля**: argon2id или bcrypt (cost ≥ 12).
3. **Хэш OTP**: SHA-256 с серверным pepper из env (`OTP_PEPPER`) или HMAC.
4. **Rate limit** на IP + на email (отдельно): register, login, forgot, otp/verify, otp/resend.
5. **Инвалидация сессий** после сброса пароля.
6. Не логировать plaintext OTP и пароли в production.
7. CORS / стандартные заголовки безопасности — как в текущем API.

---

## 8. Пошаговый план реализации

### Шаг B0 — Конфиг и зависимости

- Env: `SMTP_*` / API-ключ почты, `OTP_TTL_SEC=600`, `OTP_RESEND_COOLDOWN_SEC=60`, `OTP_MAX_ATTEMPTS=5`, `OTP_PEPPER`, `OTP_DEV_LOG`.
- Подключить почтовый SDK / nodemailer.
- Добавить модель `EmailOtpChallenge` и поля User.

**DoD:** приложение стартует с новыми env; миграция/схема применена.

### Шаг B1 — EmailService + генерация OTP

- Реализовать генерацию 6 цифр, хэширование, создание/инвалидацию challenge.
- Юнит-тесты: TTL, attempts, cooldown.

**DoD:** без HTTP можно создать challenge и проверить код в тестах.

### Шаг B2 — Register → OTP → Verify

- Изменить `POST /auth/register`.
- Добавить `POST /auth/otp/verify`, `POST /auth/otp/resend`.
- Изменить `POST /auth/login` → `EMAIL_NOT_VERIFIED`.

**DoD:** Postman/curl: register → письмо/лог кода → verify → `/auth/me` с токеном; повторный register того же email с `emailVerified=true` → 409.

### Шаг B3 — Password reset

- `POST /auth/password/forgot`
- `POST /auth/password/reset`
- Отзыв refresh-токенов после сброса.

**DoD:** полный флоу сброса; старый пароль больше не работает; старые refresh отклоняются.

### Шаг B4 — Документация и контракт

- Обновить `openapi.yaml`, `TECH_DOCS.md` §3.1.
- Согласовать финальные DTO с frontend (`RN_FRONTEND_TZ.md` §7).

**DoD:** OpenAPI валиден; примеры запросов/ответов совпадают с реализацией.

### Шаг B5 — Наблюдаемость

- Метрики/логи: otp_sent, otp_verified, otp_failed, email_send_failed (без кода/пароля).
- Алерты на рост `EMAIL_SEND_FAILED`.

**DoD:** в staging видно успешную доставку и ошибки провайдера.

---

## 9. Definition of Done

- [ ] Регистрация не выдаёт токены до успешного OTP
- [ ] 6-значный код живёт 10 минут, max 5 попыток, resend cooldown 60 с
- [ ] Login неподтверждённого пользователя → `EMAIL_NOT_VERIFIED`
- [ ] Forgot/reset работают; после reset старые сессии отозваны
- [ ] Anti-enumeration на forgot
- [ ] OTP не хранится и не логируется plaintext в production
- [ ] `openapi.yaml` и `TECH_DOCS.md` обновлены
- [ ] Frontend-команда может пройти сценарии из `RN_FRONTEND_TZ.md` §7 против staging API
