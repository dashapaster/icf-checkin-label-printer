# DYMO Connect Simulator

Local DYMO Connect Framework simulator for macOS that accepts Elvanto print calls and logs every request payload.

The simulator mirrors the DYMO JavaScript SDK's local web service target:

- `https://127.0.0.1:41951/DYMO/DLS/Printing/StatusConnected`
- `https://127.0.0.1:41951/DYMO/DLS/Printing/GetPrinters`
- `https://127.0.0.1:41951/DYMO/DLS/Printing/OpenLabelFile`
- `https://127.0.0.1:41951/DYMO/DLS/Printing/PrintLabel`
- `https://127.0.0.1:41951/DYMO/DLS/Printing/PrintLabel2`
- `https://127.0.0.1:41951/DYMO/DLS/Printing/RenderLabel`
- `https://127.0.0.1:41951/DYMO/DLS/Printing/LoadImageAsPngBase64`
- `https://127.0.0.1:41951/DYMO/DLS/Printing/Is550Printer`
- `https://127.0.0.1:41951/DYMO/DLS/Printing/GetConsumableInfoIn550Printer`
- `https://127.0.0.1:41951/DYMO/DLS/Printing/GetJobStatus`

It can also render captured DYMO label data to a PNG and send that image to a Brother `QL-820NWBc` over IPP.

## Start

```bash
npm run cert
npm start
```

If Elvanto runs in a browser, trust `certs/localhost-cert.pem` in Keychain Access first or the browser may reject the local HTTPS connection.

To keep it running in the background on macOS:

```bash
npm run install-launchd
```

That installs a LaunchAgent at `~/Library/LaunchAgents/com.local.dymo-connect-simulator.plist`.

## What gets logged

Every request is saved in:

- `logs/requests/*.json`: full request and response details
- `logs/requests/latest.json`: most recent request
- `logs/payloads/*-label.xml`: raw label XML
- `logs/payloads/*-label-set.xml`: label set XML
- `logs/payloads/*-print-params.xml`: print parameters
- `logs/payloads/*-render-params.xml`: render parameters
- `logs/rendered/*.json`: the intermediate render spec used for Brother printing
- `logs/rendered/*.png`: the generated Brother print image
- `logs/rendered/*-print-error.txt`: Brother printing errors, if any

## Brother Printer Setup

Create the macOS queue once:

```bash
sudo lpadmin -p Brother_QL_820NWBc -E -v ipp://192.168.200.27/ipp/print -m everywhere
```

The simulator will then print each `PrintLabel` and `PrintLabel2` request to that queue using Brother stock `29x62mm`, rendered in a wide badge layout.

## Notes

- The simulator exposes one printer named `DYMO LabelWriter 450`.
- `RenderLabel` and `LoadImageAsPngBase64` return a tiny valid PNG in base64.
- `PrintLabel2` returns a synthetic job id, and `GetJobStatus` can report it back.
- If Elvanto needs a different printer name, start with:

```bash
DYMO_SIM_PRINTER_NAME="Your printer name" npm start
```
