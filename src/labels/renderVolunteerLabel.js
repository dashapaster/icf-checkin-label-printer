const {
  buildTextObject,
  determineOrientation,
  extractDesktopLabelDepartment,
  extractDesktopLabelName,
  findBestDepartment,
  findBestName,
  parseObjectData,
  parseRoundRectangle,
  stripXml,
} = require("./shared");

function renderVolunteerLabel({
  form,
  requestId,
  defaultPrinterName,
  brotherExampleTemplate,
  logoPath,
  timezone,
}) {
  const labelXml = form.labelXml;
  const labelSetXml = form.labelSetXml || "";
  const desktopLabelName = extractDesktopLabelName(labelXml);
  const orientation = determineOrientation(labelXml);
  const brotherLayout = desktopLabelName
    ? {
        width: 696,
        height: 505,
        orientation: "landscape",
        sourceWidth: 6200,
        sourceHeight: 4500,
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
  const checkinTime = new Date()
    .toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone || process.env.TZ || "Asia/Jerusalem",
    })
    .replace(",", "  · ");

  return {
    type: "volunteer",
    spec: {
      width: brotherLayout.width,
      height: brotherLayout.height,
      orientation: brotherLayout.orientation,
      sourceWidth: drawRect.width || brotherLayout.sourceWidth,
      sourceHeight: drawRect.height || brotherLayout.sourceHeight,
      title: form.printerName || defaultPrinterName,
      fallbackText: fallbackText || stripXml(labelXml).slice(0, 200),
      focusName,
      focusDepartment,
      rotateText: true,
      templateMode: "icf-checkin-app",
      logoPath: brotherExampleTemplate.logoPath || logoPath || "",
      churchName: "ICF TEL AVIV",
      securityCode,
      checkinTime,
      exampleTemplate: brotherExampleTemplate.template,
      objects,
    },
  };
}

function createSecurityCode(requestId) {
  const clean = String(requestId || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
  return (clean.slice(-4) || "ICF1").padStart(4, "X");
}

module.exports = {
  renderVolunteerLabel,
};
