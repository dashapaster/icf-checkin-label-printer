const { AppError } = require("../errors/AppError");

function parseAttributes(input) {
  const attrs = {};

  for (const match of String(input).matchAll(/([A-Za-z0-9:_-]+)="([^"]*)"/g)) {
    attrs[match[1]] = match[2];
  }

  return attrs;
}

function decodeXml(value) {
  return String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripXml(xml) {
  return decodeXml(String(xml).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function getTagText(xml, tagName) {
  const match = String(xml).match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? decodeXml(match[1].trim()) : "";
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

function parseRoundRectangle(xml) {
  const match = String(xml).match(/<RoundRectangle\b([^>]*)\/?>/i);
  return parseAttributes(match ? match[1] : "");
}

function parseBounds(block) {
  const match = String(block).match(/<Bounds\b([^>]*)\/?>/i);
  const attrs = parseAttributes(match ? match[1] : "");

  return {
    x: Number(attrs.X || 0),
    y: Number(attrs.Y || 0),
    width: Number(attrs.Width || 2000),
    height: Number(attrs.Height || 500),
  };
}

function parseObjectData(xml) {
  const map = {};

  for (const match of String(xml).matchAll(/<ObjectData\b([^>]*)>([\s\S]*?)<\/ObjectData>/g)) {
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

function buildTextObject(block, values) {
  if (!/<TextObject>/i.test(block)) {
    return null;
  }

  const name = getTagText(block, "Name") || "TEXT";
  const bounds = parseBounds(block);
  const defaultText = getTagText(block, "String") || name;
  const fontMatch = String(block).match(/<Font\b([^>]*)\/?>/i);
  const fontAttrs = parseAttributes(fontMatch ? fontMatch[1] : "");
  const text = values[name] || values[`${name}Text`] || values[`${name}_TEXT`] || defaultText;

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

function extractDesktopLabelLines(labelXml) {
  return [...String(labelXml).matchAll(/<LineTextSpan>[\s\S]*?<TextSpan>[\s\S]*?<Text>([\s\S]*?)<\/Text>/g)]
    .map((match) => decodeXml(match[1].trim()))
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
}

function extractDesktopLabelName(labelXml) {
  const lines = extractDesktopLabelLines(labelXml);
  return lines[0] || "";
}

function extractDesktopLabelDepartment(labelXml) {
  const lines = extractDesktopLabelLines(labelXml);
  return lines[1] || "";
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

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripFormattingTags(value) {
  return String(value || "")
    .replace(/\[\/?(?:b|center)\]/gi, "")
    .replace(/\[size=\d+\]/gi, "")
    .replace(/\[\/size\]/gi, "")
    .trim();
}

function normalizeTemplateContent(value) {
  return normalizeWhitespace(stripFormattingTags(value)).toLowerCase();
}

function hasUnresolvedPlaceholders(value) {
  return /\[[^\]]+\]/.test(String(value || ""));
}

function compileTemplate(template, data) {
  return String(template || "").replace(/\[([A-Za-z0-9_-]+)\]/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(data, key) && data[key] != null && data[key] !== "") {
      return String(data[key]);
    }

    return match;
  });
}

function textFromTemplate(template, data) {
  const compiled = compileTemplate(template, data);
  return stripFormattingTags(compiled);
}

function splitTemplateLines(template, data) {
  return textFromTemplate(template, data)
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter((line, index, lines) => line || index < lines.length - 1);
}

function extractChildLabelData(lines) {
  const safeLines = [...lines];
  const firstLine = safeLines[0] || "";
  let securityLine = "";
  let ageLineIndex = 1;

  let name = firstLine;
  let securityCode = "";
  const firstMatch = firstLine.match(/^(.*?)\s*#([A-Za-z0-9\[\]_-]+)\s*$/);
  if (firstMatch) {
    name = normalizeWhitespace(firstMatch[1]);
    securityCode = normalizeWhitespace(firstMatch[2]);
  } else if (/^#/.test(safeLines[1] || "")) {
    securityLine = safeLines[1];
    securityCode = normalizeWhitespace(securityLine.replace(/^#/, ""));
    ageLineIndex = 2;
  }

  const ageLine = safeLines[ageLineIndex] || "";
  const roomLine = safeLines[ageLineIndex + 1] || "";
  const dateLine = safeLines[ageLineIndex + 2] || "";

  let age = "";
  let mobile = "";
  const ageMatch = ageLine.match(/^(.*?)years?\s*(.*)$/i);
  if (ageMatch) {
    age = normalizeWhitespace(ageMatch[1]);
    mobile = normalizeWhitespace(ageMatch[2]);
  } else {
    mobile = ageLine;
  }

  return {
    name,
    securityCode,
    age,
    mobile,
    room: roomLine,
    date: dateLine,
  };
}

function extractParentLabelData(lines) {
  const normalized = lines.map((line) => normalizeWhitespace(line)).filter((line) => line !== "");
  const name = normalized[0] || "";
  const securityLine = normalized.find((line) => /^#/.test(line)) || "";
  const securityCode = securityLine.replace(/^#/, "").trim();
  const pickupLines = normalized.filter(
    (line) => /pick up|pickup|забрать/i.test(line)
  );
  const trailing = normalized.filter(
    (line) => line !== name && line !== securityLine && !pickupLines.includes(line)
  );
  let room = trailing[0] || "";
  let dateAndTime = trailing[1] || "";
  if (!dateAndTime && looksLikeDateOrTime(room)) {
    dateAndTime = room;
    room = "";
  }
  const dateOnly = normalizeWhitespace(
    String(dateAndTime)
      .replace(/\s*\d{1,2}:\d{2}\b/g, "")
      .replace(/\s+,/g, ",")
  );

  return {
    name,
    securityCode,
    pickupLines,
    room,
    dateAndTime,
    dateOnly,
  };
}

function looksLikeDateOrTime(value) {
  const normalized = normalizeWhitespace(value).toLowerCase();
  return (
    /\b\d{1,2}:\d{2}\b/.test(normalized) ||
    /\b\d{1,2}\s+[a-z]{3,}\b/.test(normalized) ||
    /\b\d{1,2}\s+[a-z]{3,}\d{1,2}:\d{2}\b/.test(normalized)
  );
}

function ensureLabelXml(labelXml) {
  if (!normalizeWhitespace(labelXml)) {
    throw new AppError("Received empty label content.", { code: "EMPTY_CONTENT" });
  }

  if (!String(labelXml).includes("<")) {
    throw new AppError("Received malformed XML label content.", { code: "MALFORMED_XML" });
  }
}

module.exports = {
  buildTextObject,
  compileTemplate,
  decodeXml,
  determineOrientation,
  ensureLabelXml,
  extractChildLabelData,
  extractDesktopLabelDepartment,
  extractDesktopLabelLines,
  extractDesktopLabelName,
  extractParentLabelData,
  findBestDepartment,
  findBestName,
  getTagText,
  hasUnresolvedPlaceholders,
  normalizeTemplateContent,
  normalizeWhitespace,
  parseAttributes,
  parseObjectData,
  parseRoundRectangle,
  splitTemplateLines,
  stripFormattingTags,
  stripXml,
};
