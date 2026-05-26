const { AppError } = require("../errors/AppError");
const { detectLabelType } = require("./detectLabelType");
const { renderVolunteerLabel } = require("./renderVolunteerLabel");
const { renderChildLabel } = require("./renderChildLabel");
const {
  buildParentDetailLines,
  renderParentLabel,
  stripSecurityCodeFromName,
} = require("./renderParentLabel");
const { LABEL_TYPES } = require("./types");
const {
  ensureLabelXml,
  extractChildLabelData,
  extractDesktopLabelLines,
  extractParentLabelData,
  getTagText,
  normalizeWhitespace,
  splitTemplateLines,
} = require("./shared");

const recentSyntheticParents = new Map();
const SYNTHETIC_PARENT_WINDOW_MS = 30 * 1000;

function createPrintJobs({
  form,
  requestId,
  templates,
  defaultPrinterName,
  brotherExampleTemplate,
  logoPath,
  timezone,
}) {
  ensureLabelXml(form.labelXml);

  const labelName = getTagText(form.labelXml, "Description") || getTagText(form.labelXml, "LabelName");
  const labelType = detectLabelType({
    labelXml: form.labelXml,
    labelName,
    templates,
  });

  if (labelType === LABEL_TYPES.VOLUNTEER) {
    return [
      renderVolunteerLabel({
        form,
        requestId,
        defaultPrinterName,
        brotherExampleTemplate,
        logoPath,
        timezone,
      }),
    ];
  }

  if (labelType === LABEL_TYPES.CHILD) {
    const childLines = extractDesktopLabelLines(form.labelXml);
    const childData = extractChildLabelData(childLines);
    const parentLines = splitTemplateLines(templates.parent.template, {
      fullname: childData.name,
      security_code: childData.securityCode,
      checkin_room: childData.room,
      checkin_service_date: childData.date,
      checkin_service_time: "",
    });
    const parentData = extractParentLabelData(parentLines);

    rememberSyntheticParent(parentData);

    return [
      renderChildLabel({
        data: childData,
        form,
        defaultPrinterName,
      }),
      renderParentLabel({
        data: parentData,
        form,
        defaultPrinterName,
      }),
    ];
  }

  if (labelType === LABEL_TYPES.PARENT) {
    const parentData = extractParentLabelData(extractDesktopLabelLines(form.labelXml));
    if (shouldSkipSyntheticParent(parentData)) {
      return [];
    }

    return [
      renderParentLabel({
        data: parentData,
        form,
        defaultPrinterName,
      }),
    ];
  }

  throw new AppError("Cannot detect label type from label content.", {
    code: "UNKNOWN_LABEL_TYPE",
  });
}

function rememberSyntheticParent(parentData) {
  cleanupSyntheticParents();
  const fingerprint = buildParentFingerprint(parentData);
  if (fingerprint) {
    recentSyntheticParents.set(fingerprint, Date.now());
  }
}

function shouldSkipSyntheticParent(parentData) {
  cleanupSyntheticParents();
  const fingerprint = buildParentFingerprint(parentData);
  if (!fingerprint) {
    return false;
  }
  const createdAt = recentSyntheticParents.get(fingerprint);
  return Boolean(createdAt && Date.now() - createdAt <= SYNTHETIC_PARENT_WINDOW_MS);
}

function cleanupSyntheticParents() {
  const now = Date.now();
  for (const [fingerprint, createdAt] of recentSyntheticParents.entries()) {
    if (now - createdAt > SYNTHETIC_PARENT_WINDOW_MS) {
      recentSyntheticParents.delete(fingerprint);
    }
  }
}

function buildParentFingerprint(parentData) {
  return normalizeWhitespace(
    [
      stripSecurityCodeFromName(parentData.name),
      ...buildParentDetailLines(parentData),
    ]
      .filter(Boolean)
      .join("|")
  ).toLowerCase();
}

module.exports = {
  createPrintJobs,
};
