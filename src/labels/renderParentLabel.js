const { PARENT_LABEL_VARIABLES } = require("../config/parentLabelVariables");

function renderParentLabel({ data, form, defaultPrinterName, size }) {
  const layout = size || { width: 696, height: 505, orientation: "landscape" };
  const detailLines = buildParentDetailLines(data);

  return {
    type: "parent",
    spec: {
      width: layout.width,
      height: layout.height,
      orientation: layout.orientation,
      sourceWidth: layout.width,
      sourceHeight: layout.height,
      title: form.printerName || defaultPrinterName,
      fallbackText: detailLines.join("\n"),
      focusName: stripSecurityCodeFromName(data.name) || "[fullname]",
      focusDepartment: "",
      rotateText: false,
      templateMode: "icf-kids-parent",
      headerTitle: "ICF Kids Parent",
      securityCode: "",
      detailLines,
      objects: [],
    },
  };
}

function buildParentDetailLines(data) {
  const roomLine = String(data.room || "");
  const pickupLines = [...(data.pickupLines || [])].filter(Boolean);
  const detailLines = [];
  const exactRoomRule = (PARENT_LABEL_VARIABLES.replacementRules || []).find((rule) =>
    (rule.matchAny || []).some(
      (pattern) => roomLine.toLowerCase() === String(pattern).toLowerCase()
    )
  );
  const pickupRule = (PARENT_LABEL_VARIABLES.replacementRules || []).find((rule) =>
    pickupLines.some((line) =>
      (rule.matchAny || []).some((pattern) =>
        String(line || "").toLowerCase().includes(String(pattern).toLowerCase())
      )
    )
  );
  const matchedRule = exactRoomRule || pickupRule;

  if (matchedRule) {
    detailLines.push(matchedRule.text);
  }

  const dateLine = data.dateOnly || data.dateAndTime;
  if (dateLine) {
    detailLines.push(dateLine);
  }

  return detailLines;
}

function stripSecurityCodeFromName(name) {
  return String(name || "").replace(/\s*#[A-Za-z0-9_-]+\s*$/, "").trim();
}

module.exports = {
  buildParentDetailLines,
  renderParentLabel,
  stripSecurityCodeFromName,
};
