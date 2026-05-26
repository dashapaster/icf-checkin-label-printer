const { AppError } = require("../errors/AppError");
const { LABEL_TYPES } = require("./types");
const {
  extractDesktopLabelLines,
  getTagText,
  normalizeTemplateContent,
  normalizeWhitespace,
} = require("./shared");

function detectLabelType({
  labelXml,
  labelName,
  templates = {},
}) {
  const explicitName = normalizeWhitespace(labelName || "").toLowerCase();
  if (explicitName === "volunteers only label") {
    return LABEL_TYPES.VOLUNTEER;
  }
  if (explicitName === "children only label") {
    return LABEL_TYPES.CHILD;
  }
  if (explicitName === "children only parent label") {
    return LABEL_TYPES.PARENT;
  }

  const lines = extractDesktopLabelLines(labelXml);
  const labelText = normalizeTemplateContent(lines.join("\n"));
  const rawText = normalizeTemplateContent(labelXml);

  const templateEntries = [
    [LABEL_TYPES.VOLUNTEER, templates.volunteer && templates.volunteer.template],
    [LABEL_TYPES.CHILD, templates.child && templates.child.template],
    [LABEL_TYPES.PARENT, templates.parent && templates.parent.template],
  ];

  for (const [type, template] of templateEntries) {
    if (!template) {
      continue;
    }
    const templateText = normalizeTemplateContent(template);
    if (templateText && (labelText === templateText || rawText.includes(templateText))) {
      return type;
    }
  }

  if (
    rawText.includes("custom_2e7042fd-2632-4312-83a2-48324dc4394f") ||
    (rawText.includes("[firstname]") && rawText.includes("[custom")) ||
    (lines.length === 2 &&
      !rawText.includes("security_code") &&
      !rawText.includes("pick up") &&
      !rawText.includes("pickup") &&
      !rawText.includes("[age]"))
  ) {
    return LABEL_TYPES.VOLUNTEER;
  }

  if (
    rawText.includes("security_code") &&
    rawText.includes("age") &&
    rawText.includes("mobile")
  ) {
    return LABEL_TYPES.CHILD;
  }

  if (
    lines.length >= 4 &&
    /#\w+/i.test(lines[0] || "") &&
    /\byears?\b/i.test(lines[1] || "") &&
    /\d{2,}/.test(lines[1] || "")
  ) {
    return LABEL_TYPES.CHILD;
  }

  if (
    lines.length >= 5 &&
    /^#\w+/i.test(lines[1] || "") &&
    /\byears?\b/i.test(lines[2] || "") &&
    /\d{2,}/.test(lines[2] || "")
  ) {
    return LABEL_TYPES.CHILD;
  }

  if (
    (rawText.includes("security_code") && rawText.includes("pick up")) ||
    labelText.includes("pick up") ||
    rawText.includes("pickup") ||
    labelText.includes("pickup") ||
    rawText.includes("забрать")
  ) {
    return LABEL_TYPES.PARENT;
  }

  const xmlLabelName = normalizeWhitespace(getTagText(labelXml, "LabelName")).toLowerCase();
  if (xmlLabelName === "volunteers only label") {
    return LABEL_TYPES.VOLUNTEER;
  }
  if (xmlLabelName === "children only label") {
    return LABEL_TYPES.CHILD;
  }
  if (xmlLabelName === "children only parent label") {
    return LABEL_TYPES.PARENT;
  }

  throw new AppError("Cannot detect label type from label content.", {
    code: "UNKNOWN_LABEL_TYPE",
  });
}

module.exports = {
  detectLabelType,
};
