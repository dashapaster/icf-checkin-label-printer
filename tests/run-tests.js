const assert = require("assert");

const { detectLabelType } = require("../src/labels/detectLabelType");
const { loadLabelTemplates, FALLBACK_TEMPLATES } = require("../src/elvanto/labelTemplates");
const { createPrintJobs } = require("../src/labels/createPrintJobs");
const { LABEL_TYPES } = require("../src/labels/types");
const { renderParentLabel } = require("../src/labels/renderParentLabel");

async function main() {
  const results = [];

  await test("volunteer detection keeps existing resolved content flow", () => {
    const labelXml = createDesktopLabel(["Daria", "Welcome Team"]);
    const type = detectLabelType({
      labelXml,
      templates: FALLBACK_TEMPLATES,
    });
    assert.strictEqual(type, LABEL_TYPES.VOLUNTEER);
  }, results);

  await test("child detection works from placeholder content", () => {
    const labelXml = createDesktopLabel([
      "[fullname] #[security_code]",
      "[age]years [mobile]",
      "[checkin_room]",
      "[checkin_service_date]",
    ]);
    const type = detectLabelType({
      labelXml,
      templates: FALLBACK_TEMPLATES,
    });
    assert.strictEqual(type, LABEL_TYPES.CHILD);
  }, results);

  await test("child detection works from resolved Elvanto content with separate security line", () => {
    const labelXml = createDesktopLabel([
      "Adam Goldshtein",
      "#568",
      "3 years 053-402-2626",
      "ICF Play and Pray",
      "8 May",
    ]);
    const type = detectLabelType({
      labelXml,
      templates: FALLBACK_TEMPLATES,
    });
    assert.strictEqual(type, LABEL_TYPES.CHILD);
  }, results);

  await test("parent detection works from pickup content", () => {
    const labelXml = createDesktopLabel([
      "Adam Goldshtein",
      "#568",
      "Pray and Play 17:30 pick up",
      "2nd service 19:15 pick up",
      "ICF Kids",
      "24 April 17:45",
    ]);
    const type = detectLabelType({
      labelXml,
      templates: FALLBACK_TEMPLATES,
    });
    assert.strictEqual(type, LABEL_TYPES.PARENT);
  }, results);

  await test("missing api key falls back to built-in templates", async () => {
    const bundle = await loadLabelTemplates({
      apiKey: "",
      logger: { log() {}, warn() {} },
    });
    assert.strictEqual(bundle.source, "fallback");
    assert.strictEqual(bundle.templates.volunteer.labelName, "Volunteers Only Label");
  }, results);

  await test("fallback templates load when API templates are unavailable", async () => {
    const bundle = await loadLabelTemplates({
      apiKey: "fake-key",
      logger: { log() {}, warn() {} },
    });
    assert.strictEqual(bundle.source, "fallback");
    assert.strictEqual(bundle.templates.child.labelName, "Children Only Label");
  }, results);

  await test("children label creates child and parent print jobs", () => {
    const labelXml = createDesktopLabel([
      "[fullname] #[security_code]",
      "[age]years [mobile]",
      "[checkin_room]",
      "[checkin_service_date]",
    ]);
    const jobs = createPrintJobs({
      form: {
        printerName: "DYMO LabelWriter 450",
        labelXml,
        labelSetXml: "",
      },
      requestId: "2026-04-30T10-00-00-000Z-0001",
      templates: FALLBACK_TEMPLATES,
      defaultPrinterName: "DYMO LabelWriter 450",
      brotherExampleTemplate: { logoPath: "", template: null },
      logoPath: "",
      timezone: "Asia/Jerusalem",
    });

    assert.strictEqual(jobs.length, 2);
    assert.strictEqual(jobs[0].spec.templateMode, "icf-kids-child");
    assert.strictEqual(jobs[1].spec.templateMode, "icf-kids-parent");
    assert.deepStrictEqual(jobs[0].spec.detailLines, [
      "[age] years [mobile]",
      "[checkin_room]",
      "[checkin_service_date]",
    ]);
    assert.ok(!jobs[1].spec.detailLines.join("\n").includes("[checkin_service_time]"));
  }, results);

  await test("resolved child label creates child and parent print jobs and skips duplicate explicit parent", () => {
    const childLabelXml = createDesktopLabel([
      "Adam Goldshtein",
      "#568",
      "3 years 053-402-2626",
      "ICF Play and Pray",
      "8 May",
    ]);
    const childJobs = createPrintJobs({
      form: {
        printerName: "DYMO LabelWriter 450",
        labelXml: childLabelXml,
        labelSetXml: "",
      },
      requestId: "2026-04-30T10-00-00-000Z-0002",
      templates: FALLBACK_TEMPLATES,
      defaultPrinterName: "DYMO LabelWriter 450",
      brotherExampleTemplate: { logoPath: "", template: null },
      logoPath: "",
      timezone: "Asia/Jerusalem",
    });

    assert.strictEqual(childJobs.length, 2);
    assert.deepStrictEqual(childJobs[0].spec.detailLines, [
      "3 years 053-402-2626",
      "ICF Play and Pray",
      "8 May",
    ]);

    const explicitParentXml = createDesktopLabel([
      "Adam Goldshtein",
      "#568",
      "Pray and Play 17:30 забрать",
      "2 service 19:15 забрать",
      "8 May15:30",
    ]);
    const parentJobs = createPrintJobs({
      form: {
        printerName: "DYMO LabelWriter 450",
        labelXml: explicitParentXml,
        labelSetXml: "",
      },
      requestId: "2026-04-30T10-00-00-000Z-0003",
      templates: FALLBACK_TEMPLATES,
      defaultPrinterName: "DYMO LabelWriter 450",
      brotherExampleTemplate: { logoPath: "", template: null },
      logoPath: "",
      timezone: "Asia/Jerusalem",
    });

    assert.strictEqual(parentJobs.length, 0);
  }, results);

  await test("parent label hides copy text, security code, and service time", () => {
    const rendered = renderParentLabel({
      data: {
        name: "Adam Goldshtein",
        securityCode: "568",
        pickupLines: ["Pray and Play 17:30 pick up", "2nd service 19:15 pick up"],
        room: "ICF Kids",
        dateAndTime: "1 May, 2026 17:45",
        dateOnly: "1 May, 2026",
      },
      form: { printerName: "DYMO LabelWriter 450" },
      defaultPrinterName: "DYMO LabelWriter 450",
    });

    assert.strictEqual(rendered.spec.headerTitle, "ICF Kids Parent");
    assert.strictEqual(rendered.spec.securityCode, "");
    assert.strictEqual(rendered.spec.focusName, "Adam Goldshtein");
    assert.deepStrictEqual(rendered.spec.detailLines, [
      "19:15 - Забрать детей",
      "1 May, 2026",
    ]);
  }, results);

  await test("unknown labels throw clear detection error", () => {
    const labelXml = createDesktopLabel(["Something", "Completely Different", "No Match"]);
    assert.throws(
      () =>
        detectLabelType({
          labelXml,
          templates: FALLBACK_TEMPLATES,
        }),
      /Cannot detect label type from label content/
    );
  }, results);

  const failed = results.filter((result) => result.status === "failed");
  for (const result of results) {
    const prefix = result.status === "passed" ? "PASS" : "FAIL";
    console.log(`${prefix} ${result.name}`);
    if (result.status === "failed") {
      console.error(result.error);
    }
  }

  if (failed.length > 0) {
    process.exit(1);
  }
}

async function test(name, fn, results) {
  try {
    await fn();
    results.push({ name, status: "passed" });
  } catch (error) {
    results.push({ name, status: "failed", error });
  }
}

function createDesktopLabel(lines) {
  const formattedText = lines
    .map(
      (line, index) =>
        `<LineTextSpan><TextSpan><Text>${escapeXml(line)}</Text><FontInfo><FontName>${
          index === 0 ? "" : "Arial"
        }</FontName><FontSize>${index === 0 ? 16 : 12}</FontSize><IsBold>${
          index === 0 ? "True" : "False"
        }</IsBold><IsItalic>False</IsItalic><IsUnderline>False</IsUnderline><FontBrush><SolidColorBrush><Color A="1" R="0" G="0" B="0"></Color></SolidColorBrush></FontBrush></FontInfo></TextSpan></LineTextSpan>`
    )
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?><DesktopLabel Version="1"><DYMOLabel Version="3"><Description>DYMO Label</Description><Orientation>Portrait</Orientation><LabelName>S0722540 multipurpose</LabelName><DynamicLayoutManager><LabelObjects><TextObject><Name>Text</Name><FormattedText>${formattedText}</FormattedText></TextObject></LabelObjects></DynamicLayoutManager></DYMOLabel></DesktopLabel>`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
