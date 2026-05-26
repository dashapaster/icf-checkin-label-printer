# Инструкция: запуск сервиса и check-in в Elvanto

Этот сервис нужен для того, чтобы:

- Elvanto видел локальный `DYMO Connect` сервис
- все запросы на печать проходили через наш локальный сервер
- наклейки печатались на Brother принтере
- в Terminal были видны логи всех запросов

## 1. Что нужно перед началом

Убедись, что:

- Mac подключен к интернету и к той же сети, что и Brother принтер
- Brother принтер включен
- проект находится в папке:

```bash
/Users/dashapasternak/Documents/icf-checkin-label-printer
```

## 2. Как запустить сервис

1. Открой `Terminal`
2. Выполни команды:

```bash
cd "/Users/dashapasternak/Documents/icf-checkin-label-printer"
kill $(lsof -tiTCP:41951 -sTCP:LISTEN) 2>/dev/null
npm start
```

Что делают эти команды:

- переходят в папку проекта
- останавливают старую копию сервиса, если она уже запущена
- запускают текущую версию сервиса

## 3. Как понять, что сервис запустился

После запуска в Terminal должно появиться что-то похожее на:

```text
DYMO simulator listening on https://127.0.0.1:41951/DYMO/DLS/Printing
Printer name: DYMO LabelWriter 450
Request logs: /Users/dashapasternak/Documents/icf-checkin-label-printer/logs/requests
Extracted payloads: /Users/dashapasternak/Documents/icf-checkin-label-printer/logs/payloads
```

Это значит, что сервис работает и готов принимать запросы от Elvanto.

## 4. Как проверить сервис вручную

Пока сервис запущен, открой в Chrome:

- [StatusConnected](https://127.0.0.1:41951/DYMO/DLS/Printing/StatusConnected)

Если всё хорошо, на странице должно быть:

```text
true
```

Можно также проверить список принтеров:

- [GetPrinters](https://127.0.0.1:41951/DYMO/DLS/Printing/GetPrinters)

Если всё хорошо, откроется XML, в котором будет:

```text
DYMO LabelWriter 450
```

## 5. Если Chrome показывает предупреждение безопасности

Запусти первичную настройку один раз на каждом Mac:

```bash
cd "/Users/dashapasternak/Documents/icf-checkin-label-printer"
npm run trust-system-cert
```

Скрипт создаст локальный CA-сертификат и добавит его в System Keychain как доверенный для SSL. macOS попросит пароль администратора один раз. После этого полностью закрой и снова открой Chrome.

## 6. Как запустить check-in в Elvanto

1. Открой Elvanto в браузере
2. Перейди в `Services`
3. Открой нужный сервис и зайди в `Check In`

Дальше есть два режима, которые используются вместе:

### Шаг 1. Start Printing Station

1. Нажми `Start Printing Station`
2. В поле имени станции введи:

```text
Brother
```

3. Убедись, что станция открылась без ошибки

Это нужно, чтобы Elvanto инициализировал локальный DYMO-compatible сервис.

### Шаг 2. Self Check-in

1. Снова открой `Services`
2. Открой нужный check-in
3. Запусти `Self Check-in`

После этого можно печатать наклейки через self check-in flow.

## 7. Что должно происходить при печати

Когда Elvanto отправляет печать:

- в Terminal сразу появляются живые логи запросов
- сервис получает `PrintLabel`
- сервис определяет тип наклейки
- потом рендерит наклейку и отправляет её на Brother

Для детей печать работает так:

- `child` label
- `parent` label

Для volunteers печатается одна наклейка.

## 8. Где смотреть логи

### В Terminal

Самые удобные живые логи видны прямо в окне Terminal, где запущен `npm start`.

### В файлах

Все файлы логов сохраняются сюда:

- [logs/requests](/Users/dashapasternak/Documents/icf-checkin-label-printer/logs/requests)
- [logs/payloads](/Users/dashapasternak/Documents/icf-checkin-label-printer/logs/payloads)
- [logs/rendered](/Users/dashapasternak/Documents/icf-checkin-label-printer/logs/rendered)

Что в них есть:

- полный request от Elvanto
- `labelXml`
- `labelSetXml`
- render spec
- PNG наклейки
- ошибки direct print
- статус `cups fallback`

## 9. Как остановить сервис

Если сервис запущен в Terminal, нажми:

```text
Ctrl + C
```

## 10. Что делать, если не печатает

### Сервис не запускается, ошибка `EADDRINUSE`

Это значит, что старая копия уже работает.

Выполни:

```bash
kill $(lsof -tiTCP:41951 -sTCP:LISTEN) 2>/dev/null
cd "/Users/dashapasternak/Documents/icf-checkin-label-printer"
npm start
```

### Elvanto не видит сервис

Проверь вручную:

- [StatusConnected](https://127.0.0.1:41951/DYMO/DLS/Printing/StatusConnected)

Если там не `true`, значит локальный сервис не работает или Chrome блокирует сертификат.

### Печать не идёт на Brother

Проверь:

- принтер включен
- принтер подключен к Wi-Fi
- Mac в той же сети
- IP принтера не изменился

### В Terminal есть запросы, но наклейка не вышла

Тогда проверь:

- [logs/rendered](/Users/dashapasternak/Documents/icf-checkin-label-printer/logs/rendered)

Ищи файлы:

- `*-direct-error.txt`
- `*-cups-fallback.txt`
- `*-print-error.txt`

## 11. Быстрый сценарий запуска

Если нужен короткий вариант без объяснений:

```bash
cd "/Users/dashapasternak/Documents/icf-checkin-label-printer"
kill $(lsof -tiTCP:41951 -sTCP:LISTEN) 2>/dev/null
npm start
```

Потом:

1. Elvanto
2. `Services`
3. `Check In`
4. `Start Printing Station`
5. имя станции: `Brother`
6. снова `Services`
7. `Self Check-in`

## 12. Если нужна версия с картинками

Я могу сделать ещё одну отдельную инструкцию со скриншотами:

- запуск сервиса
- проверка `StatusConnected`
- `Start Printing Station`
- `Self Check-in`
- где смотреть логи

Если хочешь, я могу подготовить её следующим сообщением как отдельный файл.
