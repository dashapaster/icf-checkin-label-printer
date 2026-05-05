# ICF Check-in Label Printer

Local Node.js service that:

- simulates the DYMO Connect local web service Elvanto expects
- captures every Elvanto print request
- renders labels for a Brother `QL-820NWBc`
- supports volunteer labels, child labels, and parent labels

The existing volunteer badge layout is preserved. Children check-in prints two labels:

- child label
- parent label

## Supported Labels

- `Volunteers Only Label`
- `Children Only Label`
- `Children Only Parent Label`

Volunteer labels keep the current ICF volunteer design.

Child labels use a black-and-white thermal-friendly layout with:

- `ICF Kids` header
- large child name
- visible security code
- age / mobile
- room
- date

Parent labels use:

- `ICF Kids Parent Copy` header
- large name
- visible security code
- pickup instructions
- room
- date / service time

## Templates Source

This service can optionally use `ELVANTO_SECRET_API_KEY` to check whether Elvanto exposes check-in label templates through its API integration path.

Current behavior:

- if templates are available from Elvanto API, they are used as source of truth and the service logs:
  - `Templates loaded from Elvanto API`
- otherwise fallback templates are used and the service logs:
  - `Using fallback templates`

Fallback templates included in the service:

- volunteer
- child
- parent

## Environment

Optional env, from [.env.example](/Users/dashapasternak/Documents/New%20project/.env.example):

```bash
ELVANTO_SECRET_API_KEY=your_key_here
```

Notes:

- do not commit a real API key
- if the key is missing, the service now just uses fallback templates

## Start

Generate the local HTTPS certificate once:

```bash
npm run cert
```

Then start the service:

```bash
npm start
```

The DYMO-compatible endpoints are exposed at:

- `https://127.0.0.1:41951/DYMO/DLS/Printing/StatusConnected`
- `https://127.0.0.1:41951/DYMO/DLS/Printing/GetPrinters`
- `https://127.0.0.1:41951/DYMO/DLS/Printing/OpenLabelFile`
- `https://127.0.0.1:41951/DYMO/DLS/Printing/PrintLabel`
- `https://127.0.0.1:41951/DYMO/DLS/Printing/PrintLabel2`

If Chrome blocks the local HTTPS connection, trust:

- [localhost-cert.pem](/Users/dashapasternak/Documents/New%20project/certs/localhost-cert.pem)

To install the background launchd service:

```bash
npm run install-launchd
```

## Logs

Live request logs appear in Terminal while the service runs.

Files are also saved in:

- [logs/requests](/Users/dashapasternak/Documents/New%20project/logs/requests)
- [logs/payloads](/Users/dashapasternak/Documents/New%20project/logs/payloads)
- [logs/rendered](/Users/dashapasternak/Documents/New%20project/logs/rendered)

These include:

- full request / response JSON
- raw `labelXml`
- `labelSetXml`
- print params
- render specs
- generated PNGs
- direct print / fallback print status files

## Detection Rules

Priority:

1. Detect by label name when available:
   - `Volunteers Only Label`
   - `Children Only Label`
   - `Children Only Parent Label`
2. Fallback to content detection:
   - volunteer if content contains `custom_2e7042fd-2632-4312-83a2-48324dc4394f`
   - child if content contains `security_code`, `age`, and `mobile`
   - parent if content contains `security_code` and `pick up`

Additional compatibility heuristics are included so existing resolved volunteer labels still print without changing behavior.

If detection fails, the service throws:

```text
Cannot detect label type from label content.
```

## Children Printing Flow

For children check-in:

1. receive label content from Elvanto
2. detect `child` label
3. render child label
4. render parent label
5. print both to Brother

If Elvanto separately sends a matching parent label immediately after the synthetic parent copy, the service suppresses the duplicate within a short time window.

## Brother Printing

Direct Brother network printing is used first.

Current defaults:

- printer model: `QL-820NWB`
- identifier: `tcp://192.168.200.27:9100`

If direct print fails, the service falls back to the macOS queue.

## Tests

Run:

```bash
npm test
```

Coverage includes:

- volunteer detection
- child detection
- parent detection
- child flow creates two print jobs
- fallback template loading
- missing API key error
- unknown label error

## Troubleshooting

Port already in use:

```bash
kill $(lsof -tiTCP:41951 -sTCP:LISTEN)
```

Then restart:

```bash
ELVANTO_SECRET_API_KEY=your_key_here npm start
```

Common errors:

- `Failed to fetch templates from Elvanto API. Using fallback.`
- `Cannot detect label type from label content.`
- `Printer is not available.`
- `Print job failed.`
