# Тест-кейсы — own-slots-or-free-pragmatic · slots-server

### SLOTS-SERVER-TC1 — Страница каждой из двенадцати игр отдаётся
- **Тип:** API
- **Требование:** FR1 — «WHEN a browser requests `/play/<symbol>` for one of the twelve symbols, THE SYSTEM SHALL serve that game's page, and for any other symbol or path THE SYSTEM SHALL answer 404. (R4)»
- **Приоритет:** P1
- **Предусловия:** Стенд запущен.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Для каждого из символов tropic-escape, stellar-sevens, bumper-crop, golden-papyrus, nitro-hot, scorching-hot, pearl-reef, discovery-voyage, house-of-ra, fairytale, samurai, the-dynasty открыть `http://localhost:3000/play/<символ>?token=tok-rich`.
- **Ожидаемый результат:** Каждый раз отдаётся страница игры (HTML), скрипты и картинки грузятся с адресов `/play/<символ>/assets/…` без ошибок 404 в консоли браузера.

### SLOTS-SERVER-TC2 — Чужой символ и выход из папки дают 404
- **Тип:** API
- **Требование:** FR1 — «WHEN a browser requests `/play/<symbol>` for one of the twelve symbols, THE SYSTEM SHALL serve that game's page, and for any other symbol or path THE SYSTEM SHALL answer 404. (R4)»
- **Приоритет:** P2
- **Предусловия:** Стенд запущен.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Открыть `http://localhost:3000/play/nope`.
  2. Открыть `http://localhost:3000/play/stellar-sevens/../../package.json`.
  3. Открыть `http://localhost:3000/api/other`.
- **Ожидаемый результат:** Во всех трёх случаях ответ 404, содержимое файлов сервера не отдаётся.

### SLOTS-SERVER-TC3 — Сессия возвращает баланс игрока в центах
- **Тип:** API
- **Требование:** FR2 — «WHEN the game window asks for its session with a launch token, THE SYSTEM SHALL call the hub `balance` with that token and answer the balance in whole cents. (R4)»
- **Приоритет:** P1
- **Предусловия:** Заглушка хаба знает токен `tok-rich` с балансом 100.00.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Выполнить `curl -H "Authorization: Bearer tok-rich" "http://localhost:3000/api/game/session?game=stellar-sevens"`.
  2. Открыть `http://localhost:9100/calls`.
- **Ожидаемый результат:** Ответ `{"ok":true,"balanceCents":10000}`. В списке вызовов заглушки один вызов `balance` с токеном `tok-rich` и подписью `X-Signature`.

### SLOTS-SERVER-TC4 — Просроченная сессия не начинает раунд
- **Тип:** API
- **Требование:** FR3 — «WHEN the hub answers `SESSION_NOT_FOUND` to the balance call or to the bet call of a new spin, THE SYSTEM SHALL answer the browser `session_expired` and SHALL NOT start a round for that token; a bet refused this way, live or repeated by the sweeper, ends its round `refused`. (R19)»
- **Приоритет:** P1
- **Предусловия:** Токен `tok-expired` отвечает `SESSION_NOT_FOUND` на любой вызов.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Выполнить запрос сессии с `Authorization: Bearer tok-expired`.
  2. Отправить `POST /api/game/spin` с тем же токеном, ключом `k1`, `betCents` 100, игрой `stellar-sevens`.
  3. Посмотреть строки таблицы `rounds` в базе сервера игр.
- **Ожидаемый результат:** Оба ответа содержат `error: session_expired`. В таблице `rounds` ровно одна строка с токеном `tok-expired`: статус `refused`, `result` пуст; повтор того же ключа снова отвечает `session_expired` без второго вызова `bet`.

### SLOTS-SERVER-TC5 — Граничные ставки лестницы принимаются
- **Тип:** API
- **Требование:** FR4 — «IF a spin names a game outside the twelve or a bet that is not on that game's ladder between 0.10 and 10.00 in whole cents, THEN THE SYSTEM SHALL refuse it with `bad_request`, draw nothing and call the hub not at all. (R8)»
- **Приоритет:** P1
- **Предусловия:** Токен `tok-rich`.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Отправить спин со ставкой 10 центов.
  2. Отправить спин со ставкой 1000 центов (другой ключ).
- **Ожидаемый результат:** Оба спина принимаются (`ok: true`), заглушка получила по вызову `bet` на 10 и на 1000 центов.

### SLOTS-SERVER-TC6 — Ставки вне лестницы отклоняются без вызова хаба
- **Тип:** API
- **Требование:** FR4 — «IF a spin names a game outside the twelve or a bet that is not on that game's ladder between 0.10 and 10.00 in whole cents, THEN THE SYSTEM SHALL refuse it with `bad_request`, draw nothing and call the hub not at all. (R8)»
- **Приоритет:** P2
- **Предусловия:** Токен `tok-rich`; список вызовов заглушки очищен перезапуском стенда.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Отправить спин со ставкой 5 центов.
  2. Отправить спин со ставкой 150 центов.
  3. Отправить спин со ставкой 1001 цент.
  4. Отправить спин с игрой `nope`.
  5. Открыть `http://localhost:9100/calls` и таблицу `rounds`.
- **Ожидаемый результат:** Каждый ответ — `error: bad_request`. В списке вызовов заглушки нет ни одного вызова `bet`, новых строк в `rounds` нет.

### SLOTS-SERVER-TC7 — Раунд разыгран и сохранён до вызова ставки
- **Тип:** БД
- **Требование:** FR5 — «WHEN a valid spin arrives, THE SYSTEM SHALL draw the round on the server with a cryptographically secure random source, save it under a round id the server mints, and only then call the hub `bet`, and SHALL NOT take an outcome, a bet or a win from the browser. (R7)»
- **Приоритет:** P1
- **Предусловия:** Токен `tok-slow`: первый вызов ставки заглушка отвечает через 12 секунд (позже таймаута 10 секунд).
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Отправить спин со ставкой 100 центов, токеном `tok-slow` и ключом `s1`.
  2. Не дожидаясь ответа, посмотреть таблицу `rounds` в базе сервера игр.
- **Ожидаемый результат:** В `rounds` уже есть строка со статусом `bet_pending`, заполненным `result`, этим токеном и ключом `s1`, а заглушка ещё не ответила на ставку.

### SLOTS-SERVER-TC8 — Исход и выигрыш из запроса браузера игнорируются
- **Тип:** API
- **Требование:** FR5 — «WHEN a valid spin arrives, THE SYSTEM SHALL draw the round on the server with a cryptographically secure random source, save it under a round id the server mints, and only then call the hub `bet`, and SHALL NOT take an outcome, a bet or a win from the browser. (R7)»
- **Приоритет:** P1
- **Предусловия:** Токен `tok-rich`.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Отправить спин с телом, в которое добавлены поля `winCents: 999999`, `round: {}`, `totalWin: 1000`.
  2. Сравнить `winCents` в ответе со строкой `rounds.win_cents` и с вызовом `win` в списке заглушки.
- **Ожидаемый результат:** Лишние поля не влияют: выигрыш в ответе, в базе и в вызове `win` одинаков и определяется только сервером.

### SLOTS-SERVER-TC9 — Выигрышный спин: сначала ставка, потом выигрыш
- **Тип:** API
- **Требование:** FR6 — «WHEN the hub accepts the bet, THE SYSTEM SHALL answer the browser with the outcome and, in the same request, credit the whole win of the round with one `win` call carrying transaction ids `<roundId>:bet` and `<roundId>:win`; a round with no win ends with the bet call alone, sent with `roundClose` true. (R5, R11)»
- **Приоритет:** P1
- **Предусловия:** Токен `tok-rich`, игра `stellar-sevens`.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Повторять спин со ставкой 100 центов и новыми ключами, пока ответ не придёт с `winCents` больше 0.
  2. Открыть `http://localhost:9100/calls`.
- **Ожидаемый результат:** Для этого раунда в списке два вызова подряд: `bet` с `transactionId` `<roundId>:bet` и `roundClose: false`, затем `win` с `transactionId` `<roundId>:win` и `roundClose: true`; сумма `win` равна `winCents` из ответа. Баланс в ответе равен 10000 минус ставка плюс выигрыш.

### SLOTS-SERVER-TC10 — Проигрышный спин: только вызов ставки с закрытием раунда
- **Тип:** API
- **Требование:** FR6 — «WHEN the hub accepts the bet, THE SYSTEM SHALL answer the browser with the outcome and, in the same request, credit the whole win of the round with one `win` call carrying transaction ids `<roundId>:bet` and `<roundId>:win`; a round with no win ends with the bet call alone, sent with `roundClose` true. (R5, R11)»
- **Приоритет:** P1
- **Предусловия:** Токен `tok-rich`, игра `stellar-sevens`.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Повторять спин со ставкой 100 центов, пока ответ не придёт с `winCents` равным 0.
  2. Открыть `http://localhost:9100/calls`.
- **Ожидаемый результат:** Для этого раунда ровно один вызов `bet` с `roundClose: true`, вызова `win` нет.

### SLOTS-SERVER-TC11 — Вызовы хаба подписаны, чужая подпись отвергается
- **Тип:** API
- **Требование:** FR7 — «THE SYSTEM SHALL sign the raw body of every call to the hub with HMAC-SHA256 under the partner's secret key and send it in the header `X-Signature`. (R18)»
- **Приоритет:** P1
- **Предусловия:** Сервер игр запущен с `HUB_SECRET_KEY`, равным ключу заглушки.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Выполнить запрос сессии с токеном `tok-rich`: проверить, что приходит баланс.
  2. Перезапустить сервер игр с другим значением `HUB_SECRET_KEY` и повторить запрос сессии.
- **Ожидаемый результат:** С верным ключом баланс приходит. С неверным заглушка отвечает 401, а браузеру приходит `error: unavailable`, деньги не движутся.

### SLOTS-SERVER-TC12 — Нехватка средств: исход не показывается, раунд закрыт отказом
- **Тип:** API
- **Требование:** FR8 — «IF the hub refuses the bet with `INSUFFICIENT_FUNDS`, THEN THE SYSTEM SHALL answer `insufficient_funds`, send no outcome, mark the round refused, delete its drawn result and never repeat that bet. (R6)»
- **Приоритет:** P1
- **Предусловия:** Токен `tok-poor`: баланс 0.05.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Отправить спин со ставкой 10 центов и ключом `p1`.
  2. Повторить тот же ключ `p1`.
  3. Посмотреть строку `rounds` и список вызовов заглушки.
- **Ожидаемый результат:** Оба ответа: `error: insufficient_funds` и баланс 5, поле `round` отсутствует. В `rounds` статус `refused`, `result` пуст. В списке заглушки ровно один вызов `bet`.

### SLOTS-SERVER-TC13 — Прочий отказ ставки окончателен
- **Тип:** API
- **Требование:** FR9 — «IF the hub refuses the bet with another definite refusal (`LIMIT_EXCEEDED`, `REFUSED`, `CONFLICT`, `BAD_REQUEST`), THEN THE SYSTEM SHALL answer `bet_refused`, send no outcome, mark the round refused and never repeat that bet. (R11)»
- **Приоритет:** P2
- **Предусловия:** Токен `tok-limit`: ставка отклоняется `LIMIT_EXCEEDED`.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Отправить спин с токеном `tok-limit` и ключом `l1`.
  2. Повторить ключ `l1`.
- **Ожидаемый результат:** Оба ответа: `error: bet_refused`, исхода нет, в списке заглушки один вызов `bet`, раунд в статусе `refused`.

### SLOTS-SERVER-TC14 — Повтор ключа возвращает первый ответ и ничего не списывает
- **Тип:** API
- **Требование:** FR10 — «WHEN a spin key arrives again with the same token, THE SYSTEM SHALL answer the first answer for that key, a round that still owes its win or is parked answering its outcome marked `creditPending`, and SHALL NOT draw, debit or credit again. (R9)»
- **Приоритет:** P1
- **Предусловия:** Токен `tok-rich`.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Отправить спин с ключом `r1`, ставкой 100 центов.
  2. Отправить тот же ключ `r1` ещё раз, затем третий раз со ставкой 200 центов.
  3. Сравнить ответы, баланс и список вызовов заглушки.
- **Ожидаемый результат:** Второй и третий ответы повторяют первый (тот же `roundId` и раунд, признак `replay: true`). В списке заглушки по одному вызову `bet` (и `win`, если выигрыш был). Баланс изменился один раз.

### SLOTS-SERVER-TC15 — Один ключ у двух игроков — два разных раунда
- **Тип:** API
- **Требование:** FR10 — «WHEN a spin key arrives again with the same token, THE SYSTEM SHALL answer the first answer for that key, a round that still owes its win or is parked answering its outcome marked `creditPending`, and SHALL NOT draw, debit or credit again. (R9)»
- **Приоритет:** P2
- **Предусловия:** Токены `tok-rich` и `tok-rich-2`.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Отправить спин с ключом `same` и токеном `tok-rich`.
  2. Отправить спин с ключом `same` и токеном `tok-rich-2`.
- **Ожидаемый результат:** Два раунда с разными `roundId`, у каждого игрока списана своя ставка.

### SLOTS-SERVER-TC16 — Выигрыш в целых центрах, округление к ближайшему центу
- **Тип:** БД
- **Требование:** FR11 — «THE SYSTEM SHALL turn the engine's total win and the bet into whole cents rounded to the nearest cent, in integer arithmetic, SHALL credit that whole total in the one `win` call free games and bonus steps included, and SHALL NOT cap it. (R12, R13)»
- **Приоритет:** P1
- **Предусловия:** Токен `tok-rich`, игра `tropic-escape` (9 линий), ставка 100 центов.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Повторять спин, пока не выпадет выигрыш.
  2. Для выигравшей строки `rounds` взять `result.totalWin`, умножить на 9 и округлить до целого — получится число единиц `u`.
  3. Вычислить `u * 100 / 9` и округлить к ближайшему целому (половинки вверх).
  4. Сравнить с `win_cents` и с суммой вызова `win`.
- **Ожидаемый результат:** `win_cents` равен вычисленному целому числу центов, сумма вызова `win` ему равна, верхней границы выигрыша нет.

### SLOTS-SERVER-TC17 — Ставка без ответа повторяется, браузер получает «занято»
- **Тип:** API
- **Требование:** FR12 — «IF the hub gives no definite answer to a bet (`BUSY`, `INTERNAL`, no answer), THEN THE SYSTEM SHALL repeat the same call with the same transaction id until it is answered, within the spin request every 0.2 seconds growing to 1 second while the bet budget of 10 seconds (`HUB_CALL_TIMEOUT_MS`, longer than the hub's own 8 second wait for a busy wallet) lasts and afterwards by the sweeper, and SHALL answer the browser `busy` after that budget so that the browser can repeat the same spin key. (R11)»
- **Приоритет:** P1
- **Предусловия:** Токен `tok-slow`: первый вызов транзакции отвечает через 12 секунд и заглушка уже списала ставку; повтор той же транзакции заглушка отвечает сразу.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Отправить спин с ключом `b1`, не отменяя запрос.
  2. Засечь время до ответа браузеру.
  3. Через 15 секунд отправить тот же ключ `b1` ещё раз.
  4. Открыть список вызовов заглушки.
- **Ожидаемый результат:** Первый ответ приходит примерно через 10 секунд: `error: busy`. Второй ответ содержит раунд. Вызовы `bet` повторяются с одним и тем же `transactionId`, списание произошло один раз.

### SLOTS-SERVER-TC18 — Выигрыш, который не зачислился сразу, дозачисляется повторами
- **Тип:** API
- **Требование:** FR13 — «IF the win is not credited at once (`BUSY`, `INTERNAL`, no answer, or any refusal except `CONFLICT` and `BAD_REQUEST`), THEN THE SYSTEM SHALL answer the outcome marked `creditPending` and keep the round `win_pending`, and SHALL repeat the win call with the same transaction id and the round's own launch token at pauses growing from 5 seconds to a ceiling of 1 hour until it is accepted, parking only a round the hub answers `CONFLICT` or `BAD_REQUEST` for an operator. (R10)»
- **Приоритет:** P1
- **Предусловия:** Токен `tok-pending-win`: первые два вызова `win` отвечают 503, третий принят.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Повторять спин с ключами `w1`, `w2`… пока не выпадет выигрыш.
  2. Посмотреть ответ спина.
  3. Подождать около 20 секунд и открыть список вызовов заглушки и строку `rounds`.
- **Ожидаемый результат:** Ответ спина содержит исход и `creditPending: true`. В списке заглушки несколько вызовов `win` с одним `transactionId` и тем же токеном, паузы между ними растут (5 и 10 секунд), последний принят. В `rounds` статус `settled`.

### SLOTS-SERVER-TC19 — Конфликт выигрыша паркуется
- **Тип:** API
- **Требование:** FR13 — «IF the win is not credited at once (`BUSY`, `INTERNAL`, no answer, or any refusal except `CONFLICT` and `BAD_REQUEST`), THEN THE SYSTEM SHALL answer the outcome marked `creditPending` and keep the round `win_pending`, and SHALL repeat the win call with the same transaction id and the round's own launch token at pauses growing from 5 seconds to a ceiling of 1 hour until it is accepted, parking only a round the hub answers `CONFLICT` or `BAD_REQUEST` for an operator. (R10)»
- **Приоритет:** P2
- **Предусловия:** Токен `tok-win-conflict`.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Повторять спин, пока не выпадет выигрыш.
  2. Подождать минуту, наблюдая за списком вызовов заглушки.
  3. Открыть `http://localhost:3000/healthz`.
- **Ожидаемый результат:** После первого отказа `CONFLICT` вызовы `win` этого раунда больше не повторяются, статус раунда `parked`, в `/healthz` `parked` равно 1.

### SLOTS-SERVER-TC20 — Раунды хранятся без срока
- **Тип:** БД
- **Требование:** FR14 — «THE SYSTEM SHALL keep every round, with its bet, outcome, win, status and launch token, without expiry. (R17)»
- **Приоритет:** P1
- **Предусловия:** Выполнено несколько спинов разными токенами.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Перезапустить сервер игр.
  2. Посмотреть таблицу `rounds`.
  3. Убедиться, что в проекте нет задач очистки (поиск в настройках и в `/healthz`).
- **Ожидаемый результат:** Все прежние раунды на месте с ставкой, исходом (кроме отклонённых), выигрышем, статусом и токеном.

### SLOTS-SERVER-TC21 — Тревога и счётчики здоровья
- **Тип:** API
- **Требование:** FR15 — «WHEN a bet call or a win call has failed more than 5 times for a round, THE SYSTEM SHALL log an error line `bet_pending_alert` or `win_pending_alert` for every further attempt, and `GET /healthz` SHALL report how many rounds wait for a bet or a win, how many are parked and the age of the oldest. (R10)»
- **Приоритет:** P2
- **Предусловия:** Токен `tok-win-busy`: каждый вызов `win` отвечает 503 BUSY.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Сделать выигрышный спин с токеном `tok-win-busy`.
  2. Дождаться шестой неудачной попытки `win` (паузы 5, 10, 20, 40, 80 секунд).
  3. Открыть лог сервера игр и `http://localhost:3000/healthz`.
- **Ожидаемый результат:** Начиная с шестой неудачной попытки в логе строка уровня error `win_pending_alert` на каждую попытку, до пятой её нет. `/healthz` показывает `waitingWin` 1 и возраст самого старого.

### SLOTS-SERVER-TC22 — Без токена играть нельзя
- **Тип:** API
- **Требование:** FR16 — «THE SYSTEM SHALL NOT offer demo play or guest play: every call under `/api/game/` without a launch token is refused, and no game window plays a round without the server. (R3)»
- **Приоритет:** P1
- **Предусловия:** Стенд запущен.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Выполнить `GET /api/game/session?game=stellar-sevens` без заголовка `Authorization`.
  2. Выполнить `POST /api/game/spin` без заголовка.
  3. Открыть в браузере `http://localhost:3000/play/stellar-sevens` без `?token=`.
- **Ожидаемый результат:** Оба вызова API отвечают `error: session_expired`, вызовов хаба нет. Страница игры показывает SESSION EXPIRED. REOPEN THE GAME., кнопка SPIN ничего не делает, надписи DEMO нет.

### SLOTS-SERVER-TC23 — Скрипт загрузки отправляет двенадцать плиток в хаб
- **Тип:** API
- **Требование:** FR17 — «WHEN the upload script runs, THE SYSTEM SHALL send the tile image of each of the twelve games to the hub's `GameService.UpdateImage` under the game's hub identity (`x-catalog.games[].identity` of the contract, not its symbol), image key `1x1` and the shared catalogue key. (R1)»
- **Приоритет:** P2
- **Предусловия:** Хаб (dev) запущен с `CATALOG_ADMIN_KEY` и хранилищем картинок, игры уже в каталоге после `sync`.
- **Нужно на стенде:** dev-хаб с каталогом `APEXSLOTS` и S3; `CATALOG_GRPC_ADDRESS`, `CATALOG_ADMIN_KEY` в окружении
- **Шаги:**
  1. Выполнить `npm --prefix server run upload-tiles`.
  2. Открыть список игр провайдера в лобби или `ListCasino`.
- **Ожидаемый результат:** Скрипт завершается с кодом 0 и печатает по пути на каждую из двенадцати игр (идентификаторы вида `apexslots_tropic_escape`). У каждой игры в каталоге есть картинка 1x1. С неверным ключом скрипт завершается с ошибкой и идентификатором игры.

### SLOTS-SERVER-TC24 — Окно игры берёт токен из адреса и показывает баланс с сервера
- **Тип:** UI
- **Требование:** FR18 — «WHEN a game window opens with `?token=` in its address, THE SYSTEM SHALL keep the token, send it as `Authorization: Bearer` on every call to the server, and show the balance the session answer returns. (R4)»
- **Приоритет:** P1
- **Предусловия:** Стенд запущен.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Открыть `http://localhost:9100/host/stellar-sevens?token=tok-rich`.
  2. Открыть инструменты разработчика, вкладку Сеть, найти вызов `session`.
- **Ожидаемый результат:** В окне баланс 100.00, надписи DEMO нет. Вызов `session` идёт с заголовком `Authorization: Bearer tok-rich`; куки не используются.

### SLOTS-SERVER-TC25 — Без сервера окно игры исход не придумывает
- **Тип:** UI
- **Требование:** FR19 — «THE SYSTEM SHALL NOT let the browser decide an outcome, a bet or a win: no game window contains local play, and every round it shows is the one the server answered. (R7)»
- **Приоритет:** P1
- **Предусловия:** Окно открыто с `tok-rich`.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Открыть `http://localhost:9100/host/nitro-hot?token=tok-rich`.
  2. Остановить сервер игр.
  3. Нажать SPIN.
- **Ожидаемый результат:** Показано Connection lost. Your balance is safe and correct, reconnect to continue.; выигрыша и новых символов нет, баланс не меняется.

### SLOTS-SERVER-TC26 — Исход виден только после принятия ставки, выигрыш прибавляется в конце
- **Тип:** UI
- **Требование:** FR20 — «WHEN the player spins, THE SYSTEM SHALL show no outcome before the server has accepted the bet, show the balance after the bet while the animation runs, and add the win to the shown balance when the animation ends. (R5)»
- **Приоритет:** P1
- **Предусловия:** Токен `tok-medium`: заглушка отвечает на ставку через 3 секунды.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Открыть `http://localhost:9100/host/stellar-sevens?token=tok-medium`.
  2. Нажать SPIN со ставкой 1.00 и наблюдать окно до ответа.
- **Ожидаемый результат:** Барабаны вращаются, исход и новый баланс не показаны, пока заглушка не приняла ставку; после ответа баланс показывает остаток после ставки, а выигрыш (если он есть) прибавляется, когда анимация закончилась.

### SLOTS-SERVER-TC27 — Показанный выигрыш равен зачисленному
- **Тип:** UI
- **Требование:** FR21 — «THE SYSTEM SHALL show the total win of a round as the credited amount in cents, whatever the animation does. (R13)»
- **Приоритет:** P1
- **Предусловия:** Токен `tok-rich`, игра `tropic-escape`, ставка 1.00.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Открыть `http://localhost:9100/host/tropic-escape?token=tok-rich`.
  2. Нажимать SPIN до выигрыша.
  3. Сравнить итог выигрыша в окне с `win_cents` последней строки `rounds` и с вызовом `win`.
- **Ожидаемый результат:** Итог выигрыша в окне равен `win_cents / 100` с двумя знаками, а не пересчитанному в браузере значению.

### SLOTS-SERVER-TC28 — Лестница ставок доходит до 10.00 и не дальше
- **Тип:** UI
- **Требование:** FR22 — «THE SYSTEM SHALL offer in each game only the bets of that game's own ladder from 0.10 to 10.00. (R8)»
- **Приоритет:** P1
- **Предусловия:** Окно игры открыто с `tok-rich`.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Для каждой из двенадцати игр: нажимать «+» у ставки до упора.
  2. Затем нажимать «−» до упора.
- **Ожидаемый результат:** Верхняя ставка 10.00 (15.00 не появляется), нижняя 0.10; значения идут по лестнице игры.

### SLOTS-SERVER-TC29 — Нехватка средств: сообщение и кнопка пополнения
- **Тип:** UI
- **Требование:** FR23 — «IF the balance shown is below the bet and the balance the server returns when asked is below the bet too, THEN THE SYSTEM SHALL refuse the spin without moving the reels, show "NOT ENOUGH FUNDS" and a DEPOSIT button, and WHEN the player presses the button THE SYSTEM SHALL post `{type: 'apex:deposit'}` to the parent window. (R6)»
- **Приоритет:** P1
- **Предусловия:** Токен `tok-poor`: баланс 0.05.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Открыть `http://localhost:9100/host/stellar-sevens?token=tok-poor`.
  2. Нажать SPIN.
  3. Нажать DEPOSIT.
- **Ожидаемый результат:** Барабаны не двигаются, показаны NOT ENOUGH FUNDS и кнопка DEPOSIT. После нажатия страница-хозяин (порт 9100) записывает сообщение `apex:deposit`.

### SLOTS-SERVER-TC30 — Сообщение о пополнении уходит только по кнопке и не зависит от lobby
- **Тип:** UI
- **Требование:** FR23 — «IF the balance shown is below the bet and the balance the server returns when asked is below the bet too, THEN THE SYSTEM SHALL refuse the spin without moving the reels, show "NOT ENOUGH FUNDS" and a DEPOSIT button, and WHEN the player presses the button THE SYSTEM SHALL post `{type: 'apex:deposit'}` to the parent window. (R6)»
- **Приоритет:** P2
- **Предусловия:** Токен `tok-poor`.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Открыть `http://localhost:9100/host/stellar-sevens?token=tok-poor&lobby=`.
  2. Нажать SPIN и убедиться, что сообщение страница-хозяин не получила.
  3. Нажать DEPOSIT.
  4. Повторить с `http://localhost:9100/host/stellar-sevens?token=tok-poor&lobby=https://www.example.com/lobby/page` и с `lobby`, равным адресу страницы-хозяина.
- **Ожидаемый результат:** До нажатия кнопки никаких сообщений нет. После нажатия страница-хозяин каждый раз получает `apex:deposit` без других полей, при любом значении `lobby`.

### SLOTS-SERVER-TC31 — Просроченная сессия: сообщение и отсутствие спина
- **Тип:** UI
- **Требование:** FR24 — «WHEN the server answers `session_expired`, THE SYSTEM SHALL show "SESSION EXPIRED. REOPEN THE GAME." and SHALL NOT send a spin. (R19)»
- **Приоритет:** P1
- **Предусловия:** Токен `tok-expired`.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Открыть `http://localhost:9100/host/stellar-sevens?token=tok-expired`.
  2. Нажать SPIN.
  3. Посмотреть вкладку Сеть.
- **Ожидаемый результат:** Показано SESSION EXPIRED. REOPEN THE GAME.; запроса `spin` нет, барабаны не вращаются.

### SLOTS-SERVER-TC32 — Выигрыш, ожидающий зачисления, помечен
- **Тип:** UI
- **Требование:** FR25 — «WHEN a spin answer is marked `creditPending`, THE SYSTEM SHALL show the outcome with the win marked "BEING CREDITED". (R10)»
- **Приоритет:** P1
- **Предусловия:** Токен `tok-pending-win`.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Открыть `http://localhost:9100/host/stellar-sevens?token=tok-pending-win`.
  2. Нажимать SPIN до выигрыша.
- **Ожидаемый результат:** Исход показан, выигрыш помечен BEING CREDITED, баланс в окне пока без выигрыша.

### SLOTS-SERVER-TC33 — После потери связи тот же спин возвращает свой раунд, списание одно
- **Тип:** UI
- **Требование:** FR26 — «WHEN a spin is sent, THE SYSTEM SHALL keep its key and bet in the tab's session storage until a definite answer arrives, and WHEN the window is reloaded or SPIN is pressed after a lost connection THE SYSTEM SHALL send that same key with that same bet, show that bet and lock the bet controls until a definite answer arrives, and show the round it returns. (R9)»
- **Приоритет:** P1
- **Предусловия:** Токен `tok-rich`.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Открыть `http://localhost:9100/host/stellar-sevens?token=tok-rich`.
  2. В инструментах разработчика включить режим Offline и нажать SPIN, дождаться Connection lost.
  3. Выключить Offline и нажать SPIN снова.
- **Ожидаемый результат:** После возврата связи показан раунд того же спина (в таблице `rounds` одна строка с этим ключом), ставка списана один раз.

### SLOTS-SERVER-TC34 — Перезагрузка окна возвращает неоконченный спин
- **Тип:** UI
- **Требование:** FR26 — «WHEN a spin is sent, THE SYSTEM SHALL keep its key and bet in the tab's session storage until a definite answer arrives, and WHEN the window is reloaded or SPIN is pressed after a lost connection THE SYSTEM SHALL send that same key with that same bet, show that bet and lock the bet controls until a definite answer arrives, and show the round it returns. (R9)»
- **Приоритет:** P2
- **Предусловия:** Токен `tok-rich`.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Открыть `http://localhost:9100/host/stellar-sevens?token=tok-rich`.
  2. Включить Offline, нажать SPIN, дождаться Connection lost.
  3. Выключить Offline и перезагрузить кадр игры (не страницу-хозяина).
  4. Закрыть вкладку и открыть окно заново.
- **Ожидаемый результат:** После перезагрузки раунд показывается сам, без нажатия SPIN. После закрытия вкладки и нового запуска показан обычный экран, баланс уже включает выигрыш.

### SLOTS-SERVER-TC35 — Подпись об авторстве графики на информационном экране каждой игры
- **Тип:** UI
- **Требование:** FR27 — «THE SYSTEM SHALL show on the information screen of every game the credit "Art by APEXSLOTS (apexslots.eu), CC BY 4.0". (R14)»
- **Приоритет:** P1
- **Предусловия:** Окно игры открыто с `tok-rich`.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Для каждой из двенадцати игр открыть информационный экран (кнопка i).
- **Ожидаемый результат:** Последняя строка экрана читается так: Art by APEXSLOTS (apexslots.eu), CC BY 4.0.

### SLOTS-SERVER-TC36 — Сообщения «занято», «ставка не принята», «игра недоступна»
- **Тип:** UI
- **Требование:** FR28 — «WHEN the server answers `busy`, `bet_refused` or `unavailable`, THE SYSTEM SHALL show the matching message, reveal no outcome and leave SPIN usable, a `busy` answer keeping the stored spin key and a `bet_refused` or `unavailable` answer clearing it. (R5)»
- **Приоритет:** P2
- **Предусловия:** Токены `tok-slow`, `tok-limit`; сервер игр с неверным `HUB_SECRET_KEY` для третьего шага.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Открыть `http://localhost:9100/host/stellar-sevens?token=tok-slow`, нажать SPIN, дождаться ответа.
  2. Открыть `http://localhost:9100/host/stellar-sevens?token=tok-limit`, нажать SPIN.
  3. Перезапустить сервер игр с неверным `HUB_SECRET_KEY`, открыть окно с `tok-rich`.
- **Ожидаемый результат:** Показаны THE CASINO IS BUSY. PRESS SPIN TO TRY AGAIN., THIS BET WAS NOT ACCEPTED. NOTHING WAS CHARGED. и THE GAME IS NOT AVAILABLE NOW. TRY LATER.; исхода нет, кнопка SPIN остаётся рабочей.

### SLOTS-SERVER-TC37 — Ставка, на которую хаб отвечает 403, закрывает раунд без списания
- **Тип:** API
- **Требование:** FR29 — «IF the hub answers a bet with 401, 403 or 404 (nothing moved) and every earlier send of that bet was answered "nothing moved", THEN THE SYSTEM SHALL answer `unavailable`, mark the round refused and never repeat that bet. (R11)»
- **Приоритет:** P1
- **Предусловия:** Токен `tok-forbidden`: на каждую ставку заглушка отвечает 403 без тела; прежних попыток этой ставки нет.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Отправить спин с токеном `tok-forbidden` и ключом `f1`.
  2. Повторить ключ `f1`.
  3. Подождать минуту и открыть список вызовов заглушки и строку `rounds`.
- **Ожидаемый результат:** Оба ответа: `error: unavailable`. Вызовов `bet` в списке заглушки ровно один (sweeper не повторяет), статус раунда `refused`, `result` пуст, баланс не изменился.

### SLOTS-SERVER-TC38 — Ставка с неизвестным исходом не закрывается отказом 403
- **Тип:** API
- **Требование:** FR31 — «IF an earlier send of a bet was not answered "nothing moved" (it ended with `INTERNAL`, a timeout or a transport error, or it never got an answer because the process stopped) and a later attempt gets 401, 403 or 404, THEN THE SYSTEM SHALL keep the round `bet_pending` and keep repeating that bet with the same transaction id until the hub gives a definite answer, logging `bet_pending_alert`, because the bet may already be debited. (R11)»
- **Приоритет:** P1
- **Предусловия:** Токен `tok-timeout-then-forbidden`: первая ставка раунда отвечает через 15 секунд (позже таймаута 10 секунд, заглушка уже списала ставку), дальше заглушка отвечает 403.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Отправить спин с токеном `tok-timeout-then-forbidden` и ключом `u1`, получить `busy`.
  2. Отправить тот же ключ `u1` ещё раз.
  3. Подождать две минуты, наблюдая список вызовов заглушки, лог сервера игр и строку `rounds`.
- **Ожидаемый результат:** Оба ответа браузеру — `error: busy` (не `unavailable`). Раунд остаётся `bet_pending`, в нём `bet_sends` больше `bet_busy_answers`, вызовы `bet` повторяются с одним `transactionId` с растущими паузами, с шестой неудачной попытки в логе error-строка `bet_pending_alert`.

### SLOTS-SERVER-TC39 — Две копии сервера не повторяют один вызов
- **Тип:** БД
- **Требование:** FR30 — «WHEN the sweeper repeats a leg, THE SYSTEM SHALL claim the round with a lease in a short transaction before the call, make the call outside any transaction, and write the outcome only if the round still has the status it claimed, and a spin request SHALL move the round's due time to the call timeout plus a margin before each call it makes, and a repeated key that finds the round `bet_pending` SHALL take the same lease and, with the lease held, wait for the holder's outcome up to the bet budget, so that no two callers repeat one leg. (R11)»
- **Приоритет:** P2
- **Предусловия:** Две копии сервера игр на одной базе (порты 3000 и 3001); токен `tok-win-busy` создаёт раунд, ожидающий выигрыш.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000); вторая копия сервера игр на порту 3001 с той же базой
- **Шаги:**
  1. Сделать выигрышный спин через первую копию с токеном `tok-win-busy`.
  2. Наблюдать минуту список вызовов заглушки, сгруппированный по `transactionId` и времени.
- **Ожидаемый результат:** Каждая попытка `win` по раунду приходит один раз в своё время (5, 10, 20 секунд…): в одно и то же время двух вызовов с одним `transactionId` нет. Раунд, только что сохранённый спином, sweeper не трогает, пока не пройдёт аренда (по умолчанию 12 секунд после последнего вызова спина).

### SLOTS-SERVER-TC40 — Повтор ключа раунда, ожидающего выигрыш, возвращает исход с пометкой
- **Тип:** API
- **Требование:** FR10 — «WHEN a spin key arrives again with the same token, THE SYSTEM SHALL answer the first answer for that key, a round that still owes its win or is parked answering its outcome marked `creditPending`, and SHALL NOT draw, debit or credit again. (R9)»
- **Приоритет:** P2
- **Предусловия:** Токен `tok-win-conflict` (раунд паркуется) и `tok-pending-win`.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Сделать выигрышный спин с `tok-win-conflict` и ключом `c1`, подождать, пока раунд станет `parked`.
  2. Повторить ключ `c1`.
  3. То же с `tok-pending-win`, повторив ключ сразу после первого ответа.
- **Ожидаемый результат:** Во всех повторах исход тот же, `creditPending: true`, новых вызовов `bet` и `win` из-за повтора нет.

### SLOTS-SERVER-TC41 — Занятость кошелька хаба переживается внутри запроса
- **Тип:** API
- **Требование:** FR12 — «IF the hub gives no definite answer to a bet (`BUSY`, `INTERNAL`, no answer), THEN THE SYSTEM SHALL repeat the same call with the same transaction id until it is answered, within the spin request every 0.2 seconds growing to 1 second while the bet budget of 10 seconds (`HUB_CALL_TIMEOUT_MS`, longer than the hub's own 8 second wait for a busy wallet) lasts and afterwards by the sweeper, and SHALL answer the browser `busy` after that budget so that the browser can repeat the same spin key. (R11)»
- **Приоритет:** P1
- **Предусловия:** Токен `tok-busy-once`: первая ставка отвечает 503 BUSY после ожидания 8 секунд (как хаб при занятом кошельке), следующая принята сразу.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Отправить спин с токеном `tok-busy-once`.
  2. Засечь время ответа и открыть список вызовов заглушки.
- **Ожидаемый результат:** Ответ приходит с исходом (не `busy`) примерно через 8-9 секунд; в списке два вызова `bet` с одним `transactionId`, списание произошло один раз.

### SLOTS-SERVER-TC42 — Повтор ключа не делает второго одновременного вызова ставки
- **Тип:** API
- **Требование:** FR30 — «WHEN the sweeper repeats a leg, THE SYSTEM SHALL claim the round with a lease in a short transaction before the call, make the call outside any transaction, and write the outcome only if the round still has the status it claimed, and a spin request SHALL move the round's due time to the call timeout plus a margin before each call it makes, and a repeated key that finds the round `bet_pending` SHALL take the same lease and, with the lease held, wait for the holder's outcome up to the bet budget, so that no two callers repeat one leg. (R11)»
- **Приоритет:** P2
- **Предусловия:** Токен `tok-medium`: ставка отвечает через 3 секунды.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Отправить спин с ключом `d1` и, не дожидаясь ответа, тот же ключ `d1` ещё раз.
  2. Открыть список вызовов заглушки.
- **Ожидаемый результат:** Оба ответа содержат один и тот же раунд; вызов `bet` с этим `transactionId` в списке один, второй запрос дождался исхода первого.

### SLOTS-SERVER-TC43 — Тревога по зависшей ставке
- **Тип:** API
- **Требование:** FR15 — «WHEN a bet call or a win call has failed more than 5 times for a round, THE SYSTEM SHALL log an error line `bet_pending_alert` or `win_pending_alert` for every further attempt, and `GET /healthz` SHALL report how many rounds wait for a bet or a win, how many are parked and the age of the oldest. (R10)»
- **Приоритет:** P2
- **Предусловия:** Токен `tok-bet-internal`: каждая ставка отвечает 503 INTERNAL.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Отправить спин с токеном `tok-bet-internal`, получить `busy`.
  2. Дождаться шестой неудачной попытки ставки sweeper-ом.
  3. Открыть лог сервера игр и `http://localhost:3000/healthz`.
- **Ожидаемый результат:** С шестой неудачной попытки в логе error-строка `bet_pending_alert` на каждую попытку, до пятой её нет. `/healthz` показывает `waitingBet` 1 (числом, не строкой).

### SLOTS-SERVER-TC44 — Пополнение в другом месте снимает отказ без перезапуска игры
- **Тип:** UI
- **Требование:** FR23 — «IF the balance shown is below the bet and the balance the server returns when asked is below the bet too, THEN THE SYSTEM SHALL refuse the spin without moving the reels, show "NOT ENOUGH FUNDS" and a DEPOSIT button, and WHEN the player presses the button THE SYSTEM SHALL post `{type: 'apex:deposit'}` to the parent window. (R6)»
- **Приоритет:** P2
- **Предусловия:** Токен `tok-poor` с балансом 0.05; заглушка принимает `POST /deposit/tok-poor?cents=5000`.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Открыть `http://localhost:9100/host/stellar-sevens?token=tok-poor` и нажать SPIN — показано NOT ENOUGH FUNDS.
  2. Выполнить `curl -X POST "http://localhost:9100/deposit/tok-poor?cents=5000"`.
  3. Не перезагружая окно, нажать SPIN.
- **Ожидаемый результат:** Окно спросило баланс у сервера, увидело 50.05 и приняло спин: барабаны вращаются, сообщение NOT ENOUGH FUNDS пропало.

### SLOTS-SERVER-TC45 — Пока спин не завершён, ставка в окне заблокирована и равна сохранённой
- **Тип:** UI
- **Требование:** FR26 — «WHEN a spin is sent, THE SYSTEM SHALL keep its key and bet in the tab's session storage until a definite answer arrives, and WHEN the window is reloaded or SPIN is pressed after a lost connection THE SYSTEM SHALL send that same key with that same bet, show that bet and lock the bet controls until a definite answer arrives, and show the round it returns. (R9)»
- **Приоритет:** P2
- **Предусловия:** Токен `tok-rich`.
- **Нужно на стенде:** локальный стенд: Postgres, собранные бандлы игр (`npm --prefix server run build:games`), сервер игр с заглушкой хаба (`npm --prefix server run dev:stub`: заглушка на порту 9100, сервер игр на порту 3000)
- **Шаги:**
  1. Открыть `http://localhost:9100/host/stellar-sevens?token=tok-rich`, выставить ставку 1.00.
  2. Включить Offline в инструментах разработчика и нажать SPIN, дождаться Connection lost.
  3. Нажать «+» у ставки.
  4. Выключить Offline и нажать SPIN.
- **Ожидаемый результат:** После обрыва связи ставка показывает 1.00, кнопки ставки не реагируют. Показанный раунд списан по ставке 1.00. После ответа кнопки ставки снова работают.
