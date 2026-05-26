function renderChildLabel({ data, form, defaultPrinterName, size }) {
  const layout = size || { width: 696, height: 505, orientation: "landscape" };
  const detailLines = [
    compact([formatAge(data.age), data.mobile], "  "),
    data.room,
    data.date,
  ].filter(Boolean);

  return {
    type: "child",
    spec: {
      width: layout.width,
      height: layout.height,
      orientation: layout.orientation,
      sourceWidth: layout.width,
      sourceHeight: layout.height,
      title: form.printerName || defaultPrinterName,
      fallbackText: detailLines.join("\n"),
      focusName: data.name || "[fullname]",
      focusDepartment: "",
      rotateText: false,
      templateMode: "icf-kids-child",
      headerTitle: "ICF Kids",
      securityCode: data.securityCode || "[security_code]",
      detailLines,
      objects: [],
    },
  };
}

function compact(parts, separator) {
  return parts.filter(Boolean).join(separator).replace(/\s+/g, " ").trim();
}

function formatAge(age) {
  const normalized = String(age || "").trim();
  return normalized ? `${normalized} years` : "";
}

module.exports = {
  renderChildLabel,
};
