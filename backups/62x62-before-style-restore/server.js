const fs = require("fs");
const https = require("https");
const path = require("path");
const querystring = require("querystring");
const { execFileSync } = require("child_process");
const { URL } = require("url");

const HOST = process.env.DYMO_SIM_HOST || "127.0.0.1";
const PORT = Number(process.env.DYMO_SIM_PORT || "41951");
const BASE_PATH = "/DYMO/DLS/Printing";
const REQUESTS_DIR = path.join(__dirname, "logs", "requests");
const PAYLOADS_DIR = path.join(__dirname, "logs", "payloads");
const RENDERED_DIR = path.join(__dirname, "logs", "rendered");
const CERT_DIR = path.join(__dirname, "certs");
const KEY_PATH = path.join(CERT_DIR, "localhost-key.pem");
const CERT_PATH = path.join(CERT_DIR, "localhost-cert.pem");
const DEFAULT_PRINTER_NAME =
  process.env.DYMO_SIM_PRINTER_NAME || "DYMO LabelWriter 450";
const DEFAULT_MODEL_NAME =
  process.env.DYMO_SIM_MODEL_NAME || "DYMO LabelWriter 450";
const DEFAULT_LABEL_XML =
  '<?xml version="1.0" encoding="utf-8"?><DieCutLabel Version="8.0"><PaperOrientation>Landscape</PaperOrientation><Id>Address</Id><PaperName>30252 Address</PaperName><DrawCommands><RoundRectangle X="0" Y="0" Width="3060" Height="5715" Rx="270" Ry="270" /></DrawCommands><ObjectInfo><TextObject><Name>TEXT</Name><ForeColor Alpha="255" Red="0" Green="0" Blue="0" /><BackColor Alpha="0" Red="255" Green="255" Blue="255" /><LinkedObjectName></LinkedObjectName><Rotation>Rotation0</Rotation><IsMirrored>False</IsMirrored><IsVariable>True</IsVariable><HorizontalAlignment>Center</HorizontalAlignment><VerticalAlignment>Middle</VerticalAlignment><TextFitMode>ShrinkToFit</TextFitMode><UseFullFontHeight>True</UseFullFontHeight><Verticalized>False</Verticalized><StyledText><Element><String>DYMO Simulator</String><Attributes><Font Family="Helvetica" Size="18" Bold="True" /></Attributes></Element></StyledText></TextObject><Bounds X="332" Y="150" Width="2395" Height="970" /></ObjectInfo></DieCutLabel>';
const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5Wm1QAAAAASUVORK5CYII=";
const BROTHER_QUEUE_NAME =
  process.env.BROTHER_QUEUE_NAME || "Brother_QL_820NWBc";
const BROTHER_IPP_URI =
  process.env.BROTHER_IPP_URI || "ipp://192.168.200.27/ipp/print";
const BROTHER_MEDIA =
  process.env.BROTHER_MEDIA || "om_brother-label-62mm_62mm";
const BROTHER_PRINT_ENABLED =
  String(process.env.BROTHER_PRINT_ENABLED || "true").toLowerCase() !== "false";
const BROTHER_DIRECT_ENABLED =
  String(process.env.BROTHER_DIRECT_ENABLED || "true").toLowerCase() !== "false";
const BROTHER_DIRECT_MODEL =
  process.env.BROTHER_DIRECT_MODEL || "QL-820NWB";
const BROTHER_DIRECT_LABEL =
  process.env.BROTHER_DIRECT_LABEL || "62";
const BROTHER_DIRECT_IDENTIFIER =
  process.env.BROTHER_DIRECT_IDENTIFIER || "tcp://192.168.200.27:9100";
const BROTHER_DIRECT_BACKEND =
  process.env.BROTHER_DIRECT_BACKEND || "network";
const SWIFT_RENDERER = path.join(__dirname, "scripts", "render-label.swift");
const SWIFT_CACHE_DIR = path.join(__dirname, ".swift-cache");
const SWIFT_RENDERER_BIN = path.join(__dirname, ".swift-cache", "render-label");
const DIRECT_PRINT_HELPER = path.join(__dirname, "scripts", "direct-print", "print_brother.py");
const DIRECT_PRINT_PYTHON = path.join(__dirname, ".venv-direct", "bin", "python");
const ARCH_BIN = "/usr/bin/arch";
const ICF_LOGO_PATH =
  process.env.ICF_LOGO_PATH || "/Users/dashapasternak/Downloads/icf_logo_white.png";
const EXAMPLE_LBX_PATH =
  process.env.EXAMPLE_LBX_PATH || "/Users/dashapasternak/Documents/example_label.lbx";
const EXAMPLE_TMP_DIR = path.join(__dirname, "tmp", "example_label_runtime");

let requestCounter = 0;
let jobCounter = 1000;
const jobs = new Map();
let brotherQueueVerified = false;
let rendererBinaryVerified = false;
const brotherExampleTemplate = loadBrotherExampleTemplate();

ensureDir(REQUESTS_DIR);
ensureDir(PAYLOADS_DIR);
ensureDir(RENDERED_DIR);
ensureDir(SWIFT_CACHE_DIR);
ensureDir(EXAMPLE_TMP_DIR);

if (!fs.existsSync(KEY_PATH) || !fs.existsSync(CERT_PATH)) {
  console.error("TLS certificate files are missing.");
  console.error("Run `npm run cert` first, then trust certs/localhost-cert.pem in Keychain Access.");
  process.exit(1);
}

const server = https.createServer(
  {
    key: fs.readFileSync(KEY_PATH),
    cert: fs.readFileSync(CERT_PATH),
  },
  async (req, res) => {
    const startedAt = new Date();
    const requestId = createRequestId(startedAt);
    const rawBody = await readBody(req);
    const parsedUrl = new URL(req.url, `https://${req.headers.host || `${HOST}:${PORT}`}`);
    const pathname = parsedUrl.pathname;
    const query = Object.fromEntries(parsedUrl.searchParams.entries());
    const form = parseBody(req, rawBody);

    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const logEntry = {
      requestId,
      startedAt: startedAt.toISOString(),
      method: req.method,
      url: req.url,
      pathname,
      query,
      headers: req.headers,
      rawBody,
      form,
    };

    let responseBody = "";
    let statusCode = 200;
    let contentType = "text/plain; charset=utf-8";

    try {
      if (!pathname.startsWith(BASE_PATH)) {
        statusCode = 404;
        responseBody = `Unknown path: ${pathname}`;
      } else {
        const command = pathname.slice(`${BASE_PATH}/`.length) || "";

        switch (command) {
          case "StatusConnected":
            responseBody = "true";
            break;
          case "GetPrinters":
            contentType = "application/xml; charset=utf-8";
            responseBody = buildPrintersXml();
            break;
          case "OpenLabelFile":
            contentType = "application/xml; charset=utf-8";
            responseBody = readLabelFile(query.fileName);
            break;
          case "PrintLabel":
            responseBody = handlePrintLikeCommand("PrintLabel", form, requestId);
            break;
          case "PrintLabel2":
            responseBody = handlePrintLabel2(form, requestId);
            break;
          case "GetJobStatus":
            responseBody = handleGetJobStatus(query);
            break;
          case "RenderLabel":
            responseBody = handleRenderLabel(form, requestId);
            break;
          case "LoadImageAsPngBase64":
            responseBody = PNG_1X1_BASE64;
            break;
          case "Is550Printer":
            responseBody = "false";
            break;
          case "GetConsumableInfoIn550Printer":
            responseBody = JSON.stringify({
              printerName: query.printerName || "",
              isLoaded: true,
              paperName: "30252 Address",
              sku: "30252",
              remainingLabels: 999,
            });
            break;
          default:
            statusCode = 404;
            responseBody = `Unknown DYMO command: ${command}`;
            break;
        }
      }
    } catch (error) {
      statusCode = 500;
      responseBody = String(error && error.stack ? error.stack : error);
      logEntry.error = responseBody;
    }

    logEntry.statusCode = statusCode;
    logEntry.responseBody = responseBody;
    persistRequestLog(requestId, logEntry, form);
    printRequestLog(logEntry);

    res.writeHead(statusCode, { "Content-Type": contentType });
    res.end(responseBody);
  }
);

server.listen(PORT, HOST, () => {
  console.log(`DYMO simulator listening on https://${HOST}:${PORT}${BASE_PATH}`);
  console.log(`Printer name: ${DEFAULT_PRINTER_NAME}`);
  console.log(`Request logs: ${REQUESTS_DIR}`);
  console.log(`Extracted payloads: ${PAYLOADS_DIR}`);
});

function handlePrintLikeCommand(command, form, requestId) {
  maybePrintOnBrother(command, requestId, form);
  persistPayloadArtifacts(command, requestId, form);
  return "";
}

function handlePrintLabel2(form, requestId) {
  maybePrintOnBrother("PrintLabel2", requestId, form);
  persistPayloadArtifacts("PrintLabel2", requestId, form);
  const jobId = String(jobCounter++);
  jobs.set(jobId, {
    status: 2,
    statusMessage: "Printed by simulator",
    printerName: form.printerName || DEFAULT_PRINTER_NAME,
    requestId,
  });
  return jobId;
}

function handleGetJobStatus(query) {
  const jobId = String(query.jobId || "");
  const job = jobs.get(jobId);
  if (!job) {
    return "0 Unknown job id";
  }

  return `${job.status} ${job.statusMessage}`;
}

function handleRenderLabel(form, requestId) {
  persistPayloadArtifacts("RenderLabel", requestId, form);
  return PNG_1X1_BASE64;
}

function readLabelFile(fileName) {
  if (!fileName) {
    return DEFAULT_LABEL_XML;
  }

  const resolvedPath = path.resolve(fileName);
  if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
    return fs.readFileSync(resolvedPath, "utf8");
  }

  return DEFAULT_LABEL_XML;
}

function buildPrintersXml() {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<Printers>",
    "  <LabelWriterPrinter>",
    `    <Name>${escapeXml(DEFAULT_PRINTER_NAME)}</Name>`,
    `    <ModelName>${escapeXml(DEFAULT_MODEL_NAME)}</ModelName>`,
    "    <IsConnected>True</IsConnected>",
    "    <IsLocal>True</IsLocal>",
    "    <IsTwinTurbo>False</IsTwinTurbo>",
    "  </LabelWriterPrinter>",
    "</Printers>",
  ].join("");
}

function persistRequestLog(requestId, logEntry, form) {
  const requestPath = path.join(REQUESTS_DIR, `${requestId}.json`);
  fs.writeFileSync(requestPath, JSON.stringify(logEntry, null, 2));

  const summaryPath = path.join(REQUESTS_DIR, "latest.json");
  fs.writeFileSync(summaryPath, JSON.stringify(logEntry, null, 2));

  if (form && Object.keys(form).length > 0) {
    const redactedSummary = {
      requestId,
      printerName: form.printerName || null,
      labelXmlLength: (form.labelXml || "").length,
      labelSetXmlLength: (form.labelSetXml || "").length,
      printParamsXmlLength: (form.printParamsXml || "").length,
      renderParamsXmlLength: (form.renderParamsXml || "").length,
    };
    fs.writeFileSync(
      path.join(PAYLOADS_DIR, `${requestId}-summary.json`),
      JSON.stringify(redactedSummary, null, 2)
    );
  }
}

function persistPayloadArtifacts(command, requestId, form) {
  const baseName = `${requestId}-${command}`;

  if (form.labelXml) {
    fs.writeFileSync(path.join(PAYLOADS_DIR, `${baseName}-label.xml`), form.labelXml, "utf8");
  }

  if (form.labelSetXml) {
    fs.writeFileSync(
      path.join(PAYLOADS_DIR, `${baseName}-label-set.xml`),
      form.labelSetXml,
      "utf8"
    );
  }

  if (form.printParamsXml) {
    fs.writeFileSync(
      path.join(PAYLOADS_DIR, `${baseName}-print-params.xml`),
      form.printParamsXml,
      "utf8"
    );
  }

  if (form.renderParamsXml) {
    fs.writeFileSync(
      path.join(PAYLOADS_DIR, `${baseName}-render-params.xml`),
      form.renderParamsXml,
      "utf8"
    );
  }
}

function maybePrintOnBrother(command, requestId, form) {
  if (!BROTHER_PRINT_ENABLED) {
    return;
  }

  try {
    ensureRendererBinary();
    const spec = buildRenderSpec(form, requestId);
    const specPath = path.join(RENDERED_DIR, `${requestId}-${command}.json`);
    const pngPath = path.join(RENDERED_DIR, `${requestId}-${command}.png`);
    const directConfigPath = path.join(RENDERED_DIR, `${requestId}-${command}-direct.json`);

    fs.writeFileSync(specPath, JSON.stringify(spec));
    execFileSync(SWIFT_RENDERER_BIN, [specPath, pngPath], {
      stdio: "pipe",
      env: {
        ...process.env,
        CLANG_MODULE_CACHE_PATH: SWIFT_CACHE_DIR,
      },
    });

    if (BROTHER_DIRECT_ENABLED && fs.existsSync(DIRECT_PRINT_PYTHON)) {
      fs.writeFileSync(
        directConfigPath,
        JSON.stringify({
          png_path: pngPath,
          model: BROTHER_DIRECT_MODEL,
          label: BROTHER_DIRECT_LABEL,
          printer_identifier: BROTHER_DIRECT_IDENTIFIER,
          backend: BROTHER_DIRECT_BACKEND,
          rotate: "0",
          threshold: 70.0,
          dither: false,
          compress: false,
          dpi_600: false,
          hq: true,
          cut: true,
        })
      );

      try {
        execFileSync(ARCH_BIN, ["-arm64", DIRECT_PRINT_PYTHON, DIRECT_PRINT_HELPER, directConfigPath], {
          stdio: "pipe",
        });
        fs.writeFileSync(
          path.join(RENDERED_DIR, `${requestId}-${command}-direct-ok.txt`),
          "direct brother print succeeded\n",
          "utf8"
        );
        return;
      } catch (directError) {
        const directMessage =
          directError && directError.stderr
            ? directError.stderr.toString("utf8")
            : String(directError.message || directError);
        fs.writeFileSync(
          path.join(RENDERED_DIR, `${requestId}-${command}-direct-error.txt`),
          directMessage,
          "utf8"
        );
      }
    }

    ensureBrotherQueue();
    execFileSync(
      "/usr/bin/lp",
      [
        "-d",
        BROTHER_QUEUE_NAME,
        "-o",
        "PageSize=62mm",
        "-o",
        "CutMedia=Auto",
        "-o",
        `media=${BROTHER_MEDIA}`,
        "-o",
        "print-color-mode=monochrome",
        "-o",
        spec.orientation === "landscape"
          ? "orientation-requested=4"
          : "orientation-requested=3",
        pngPath,
      ],
      { stdio: "pipe" }
    );
    fs.writeFileSync(
      path.join(RENDERED_DIR, `${requestId}-${command}-cups-fallback.txt`),
      "printed via cups fallback\n",
      "utf8"
    );
  } catch (error) {
    const message = error && error.stderr ? error.stderr.toString("utf8") : String(error.message || error);
    fs.writeFileSync(
      path.join(RENDERED_DIR, `${requestId}-${command}-print-error.txt`),
      message,
      "utf8"
    );
    console.error(`Brother print failed for ${requestId}: ${message}`);
  }
}

function ensureBrotherQueue() {
  if (brotherQueueVerified) {
    return;
  }

  try {
    execFileSync("/usr/bin/lpstat", ["-p", BROTHER_QUEUE_NAME], { stdio: "pipe" });
    brotherQueueVerified = true;
  } catch (error) {
    const message =
      "Brother queue is missing. Create it once with:\n" +
      `sudo lpadmin -p ${BROTHER_QUEUE_NAME} -E -v ${BROTHER_IPP_URI} -m everywhere`;
    throw new Error(message);
  }
}

function ensureRendererBinary() {
  if (rendererBinaryVerified && fs.existsSync(SWIFT_RENDERER_BIN)) {
    return;
  }

  const sourceStat = fs.statSync(SWIFT_RENDERER);
  const binaryExists = fs.existsSync(SWIFT_RENDERER_BIN);
  const binaryIsFresh =
    binaryExists && fs.statSync(SWIFT_RENDERER_BIN).mtimeMs >= sourceStat.mtimeMs;

  if (!binaryIsFresh) {
    execFileSync(
      "xcrun",
      ["swiftc", "-O", SWIFT_RENDERER, "-o", SWIFT_RENDERER_BIN],
      {
        stdio: "pipe",
        env: {
          ...process.env,
          CLANG_MODULE_CACHE_PATH: SWIFT_CACHE_DIR,
        },
      }
    );
  }

  rendererBinaryVerified = true;
}

function buildRenderSpec(form, requestId) {
  const labelXml = form.labelXml || DEFAULT_LABEL_XML;
  const labelSetXml = form.labelSetXml || "";
  const desktopLabelName = extractDesktopLabelName(labelXml);
  const orientation = determineOrientation(labelXml);
  const brotherLayout = desktopLabelName
    ? {
        width: 696,
        height: 696,
        orientation: "landscape",
        sourceWidth: 6200,
        sourceHeight: 6200,
      }
    : {
        width: orientation === "landscape" ? 1063 : 343,
        height: orientation === "landscape" ? 343 : 1063,
        orientation,
        sourceWidth: 5715,
        sourceHeight: 3060,
      };
  const drawRect = parseRoundRectangle(labelXml);
  const objectBlocks = [...labelXml.matchAll(/<ObjectInfo>([\s\S]*?)<\/ObjectInfo>/g)].map(
    (match) => match[1]
  );
  const values = parseObjectData(labelSetXml);
  const objects = objectBlocks
    .map((block) => buildTextObject(block, values))
    .filter(Boolean);
  const fallbackText = Object.entries(values)
    .map(([name, value]) => `${name}: ${value}`)
    .join("\n");
  const desktopDepartment = extractDesktopLabelDepartment(labelXml);
  const focusName = desktopLabelName || findBestName(objects, values) || "";
  const focusDepartment = desktopDepartment || findBestDepartment(objects, values, focusName) || "";
  const securityCode = createSecurityCode(requestId);
  const checkinTime = new Date().toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: process.env.TZ || "Asia/Jerusalem",
  }).replace(",", "  · ");

  return {
    width: brotherLayout.width,
    height: brotherLayout.height,
    orientation: brotherLayout.orientation,
    sourceWidth: drawRect.width || brotherLayout.sourceWidth,
    sourceHeight: drawRect.height || brotherLayout.sourceHeight,
    title: form.printerName || DEFAULT_PRINTER_NAME,
    fallbackText: fallbackText || stripXml(labelXml).slice(0, 200),
    focusName,
    focusDepartment,
    rotateText: true,
    templateMode: "icf-checkin-app",
    logoPath: brotherExampleTemplate.logoPath || (fs.existsSync(ICF_LOGO_PATH) ? ICF_LOGO_PATH : ""),
    churchName: "ICF TEL AVIV",
    securityCode,
    checkinTime,
    exampleTemplate: brotherExampleTemplate.template,
    objects,
  };
}

function createSecurityCode(requestId) {
  const clean = String(requestId || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
  return (clean.slice(-4) || "ICF1").padStart(4, "X");
}

function loadBrotherExampleTemplate() {
  if (!fs.existsSync(EXAMPLE_LBX_PATH)) {
    return { logoPath: fs.existsSync(ICF_LOGO_PATH) ? ICF_LOGO_PATH : "", template: null };
  }

  const labelXml = execFileSync("unzip", ["-p", EXAMPLE_LBX_PATH, "label.xml"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  let logoPath = fs.existsSync(ICF_LOGO_PATH) ? ICF_LOGO_PATH : "";
  const embeddedLogoPath = path.join(EXAMPLE_TMP_DIR, "Object0.bmp");
  try {
    execFileSync("unzip", ["-o", EXAMPLE_LBX_PATH, "Object0.bmp", "-d", EXAMPLE_TMP_DIR], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (fs.existsSync(embeddedLogoPath)) {
      logoPath = embeddedLogoPath;
    }
  } catch (error) {}

  const background = parseTagAttributes(labelXml, "style:backGround");
  const imageStyle = parseObject(labelXml, "image:image");
  const textObjects = [...labelXml.matchAll(/<text:text>([\s\S]*?)<\/text:text>/g)].map((match) =>
    parseTextObject(match[1])
  );

  return {
    logoPath,
    template: {
      background: {
        x: parsePt(background.x || "0pt"),
        y: parsePt(background.y || "0pt"),
        width: parsePt(background.width || "85pt"),
        height: parsePt(background.height || "167.1pt"),
      },
      image: {
        x: parsePt(imageStyle.objectStyle.x || "12pt"),
        y: parsePt(imageStyle.objectStyle.y || "65.3pt"),
        width: parsePt(imageStyle.objectStyle.width || "14pt"),
        height: parsePt(imageStyle.objectStyle.height || "32pt"),
        angle: Number(imageStyle.objectStyle.angle || 270),
      },
      texts: textObjects,
    },
  };
}

function parseObject(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  const body = match ? match[1] : "";
  const objectStyle = parseTagAttributes(body, "pt:objectStyle");
  return { body, objectStyle };
}

function parseTextObject(xml) {
  const objectStyle = parseTagAttributes(xml, "pt:objectStyle");
  const fontExt = parseTagAttributes(xml, "text:fontExt");
  const textAlign = parseTagAttributes(xml, "text:textAlign");
  const dataMatch = xml.match(/<pt:data>([\s\S]*?)<\/pt:data>/i);
  return {
    x: parsePt(objectStyle.x || "0pt"),
    y: parsePt(objectStyle.y || "0pt"),
    width: parsePt(objectStyle.width || "0pt"),
    height: parsePt(objectStyle.height || "0pt"),
    angle: Number(objectStyle.angle || 270),
    fontName: parseTagAttributes(xml, "text:logFont").name || "",
    fontSize: parsePt(fontExt.size || "20pt"),
    weight: Number(parseTagAttributes(xml, "text:logFont").weight || 400),
    align: (textAlign.horizontalAlignment || "LEFT").toLowerCase(),
    placeholder: decodeXml(dataMatch ? dataMatch[1].trim() : ""),
  };
}

function parseTagAttributes(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}\\b([^>]*)>`, "i")) || xml.match(new RegExp(`<${tagName}\\b([^>]*)\\/>`, "i"));
  return parseAttributes(match ? match[1] : "");
}

function parsePt(value) {
  return Number(String(value).replace(/pt$/i, "")) || 0;
}

function determineOrientation(labelXml) {
  const desktopOrientation = getTagText(labelXml, "Orientation");
  if (desktopOrientation) {
    return desktopOrientation.toLowerCase() === "landscape" ? "landscape" : "portrait";
  }

  return getTagText(labelXml, "PaperOrientation").toLowerCase() === "landscape"
    ? "landscape"
    : "portrait";
}

function buildTextObject(block, values) {
  if (!/<TextObject>/i.test(block)) {
    return null;
  }

  const name = getTagText(block, "Name") || "TEXT";
  const bounds = parseBounds(block);
  const defaultText = getTagText(block, "String") || name;
  const fontMatch = block.match(/<Font\b([^>]*)\/?>/i);
  const fontAttrs = parseAttributes(fontMatch ? fontMatch[1] : "");
  const text =
    values[name] ||
    values[`${name}Text`] ||
    values[`${name}_TEXT`] ||
    defaultText;

  return {
    name,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    text,
    fontSize: Number(fontAttrs.Size || 18),
    bold: String(fontAttrs.Bold || "False").toLowerCase() === "true",
    family: fontAttrs.Family || "Helvetica",
    horizontalAlignment: getTagText(block, "HorizontalAlignment") || "Left",
    verticalAlignment: getTagText(block, "VerticalAlignment") || "Middle",
  };
}

function extractDesktopLabelName(labelXml) {
  const lineTexts = extractDesktopLabelLines(labelXml);

  if (lineTexts.length > 0) {
    return lineTexts[0];
  }

  return "";
}

function extractDesktopLabelDepartment(labelXml) {
  const lineTexts = extractDesktopLabelLines(labelXml);
  return lineTexts.length > 1 ? lineTexts[1] : "";
}

function extractDesktopLabelLines(labelXml) {
  return [...String(labelXml).matchAll(/<LineTextSpan>[\s\S]*?<TextSpan>[\s\S]*?<Text>([\s\S]*?)<\/Text>/g)]
    .map((match) => decodeXml(match[1].trim()))
    .filter(Boolean);
}

function findBestName(objects, values) {
  const valueList = Object.values(values).filter(Boolean);
  if (valueList.length > 0) {
    return valueList[0];
  }

  const textObjects = objects
    .filter((object) => object && object.text)
    .sort((a, b) => (b.fontSize || 0) - (a.fontSize || 0));

  return textObjects.length > 0 ? textObjects[0].text : "";
}

function findBestDepartment(objects, values, focusName) {
  const valueList = Object.values(values).filter((value) => value && value !== focusName);
  if (valueList.length > 0) {
    return valueList[0];
  }

  const textObjects = objects
    .filter((object) => object && object.text && object.text !== focusName)
    .sort((a, b) => (b.fontSize || 0) - (a.fontSize || 0));

  return textObjects.length > 0 ? textObjects[0].text : "";
}

function parseObjectData(xml) {
  const map = {};

  for (const match of xml.matchAll(/<ObjectData\b([^>]*)>([\s\S]*?)<\/ObjectData>/g)) {
    const attrs = parseAttributes(match[1] || "");
    const body = match[2] || "";
    const name = attrs.Name || attrs.name;
    if (!name) {
      continue;
    }

    const text = getTagText(body, "Text") || getTagText(body, "String") || stripXml(body).trim();
    map[name] = decodeXml(text);
  }

  return map;
}

function parseRoundRectangle(xml) {
  const match = xml.match(/<RoundRectangle\b([^>]*)\/?>/i);
  return parseAttributes(match ? match[1] : "");
}

function parseBounds(block) {
  const match = block.match(/<Bounds\b([^>]*)\/?>/i);
  const attrs = parseAttributes(match ? match[1] : "");

  return {
    x: Number(attrs.X || 0),
    y: Number(attrs.Y || 0),
    width: Number(attrs.Width || 2000),
    height: Number(attrs.Height || 500),
  };
}

function parseAttributes(input) {
  const attrs = {};

  for (const match of String(input).matchAll(/([A-Za-z0-9:_-]+)="([^"]*)"/g)) {
    attrs[match[1]] = match[2];
  }

  return attrs;
}

function getTagText(xml, tagName) {
  const match = String(xml).match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? decodeXml(match[1].trim()) : "";
}

function stripXml(xml) {
  return decodeXml(String(xml).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeXml(value) {
  return String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function printRequestLog(logEntry) {
  const lines = [
    "",
    "=== DYMO Request ===",
    `id: ${logEntry.requestId}`,
    `time: ${logEntry.startedAt}`,
    `request: ${logEntry.method} ${logEntry.pathname}`,
    `status: ${logEntry.statusCode}`,
  ];

  if (Object.keys(logEntry.query || {}).length > 0) {
    lines.push("query:");
    lines.push(JSON.stringify(logEntry.query, null, 2));
  }

  if (Object.keys(logEntry.form || {}).length > 0) {
    lines.push("form:");
    lines.push(JSON.stringify(logEntry.form, null, 2));
  }

  if (logEntry.rawBody) {
    lines.push("rawBody:");
    lines.push(logEntry.rawBody);
  }

  if (logEntry.responseBody) {
    lines.push("response:");
    lines.push(logEntry.responseBody);
  }

  if (logEntry.error) {
    lines.push("error:");
    lines.push(logEntry.error);
  }

  lines.push("====================");
  console.log(lines.join("\n"));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseBody(req, rawBody) {
  if (!rawBody) {
    return {};
  }

  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(rawBody);
    } catch (error) {
      return { _raw: rawBody, _parseError: String(error.message || error) };
    }
  }

  return querystring.parse(rawBody);
}

function createRequestId(startedAt) {
  requestCounter += 1;
  return `${startedAt.toISOString().replace(/[:.]/g, "-")}-${String(requestCounter).padStart(
    4,
    "0"
  )}`;
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Requested-With");
  res.setHeader("Access-Control-Expose-Headers", "*");
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
