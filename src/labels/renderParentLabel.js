function renderParentLabel({ data, form, defaultPrinterName, size }) {
  const layout = size || { width: 696, height: 505, orientation: "landscape" };
  const detailLines = [
    ...(data.pickupLines || []),
    data.room,
    data.dateOnly || data.dateAndTime,
  ].filter(Boolean);

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
      focusName: data.name || "[fullname]",
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

module.exports = {
  renderParentLabel,
};
