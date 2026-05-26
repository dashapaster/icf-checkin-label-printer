import AppKit
import Foundation

struct RenderSpec: Decodable {
    struct ExampleTemplate: Decodable {
        struct Background: Decodable {
            let x: Double
            let y: Double
            let width: Double
            let height: Double
        }

        struct ImageTemplate: Decodable {
            let x: Double
            let y: Double
            let width: Double
            let height: Double
            let angle: Double
        }

        struct TextTemplate: Decodable {
            let x: Double
            let y: Double
            let width: Double
            let height: Double
            let angle: Double
            let fontName: String
            let fontSize: Double
            let weight: Int
            let align: String
            let placeholder: String
        }

        let background: Background
        let image: ImageTemplate
        let texts: [TextTemplate]
    }

    struct TextObject: Decodable {
        let name: String
        let x: Double
        let y: Double
        let width: Double
        let height: Double
        let text: String
        let fontSize: Double
        let bold: Bool
        let family: String
        let horizontalAlignment: String
        let verticalAlignment: String
    }

    let width: Double
    let height: Double
    let orientation: String
    let sourceWidth: Double
    let sourceHeight: Double
    let title: String
    let fallbackText: String
    let focusName: String
    let focusDepartment: String
    let rotateText: Bool?
    let templateMode: String?
    let logoPath: String?
    let churchName: String?
    let securityCode: String?
    let checkinTime: String?
    let headerTitle: String?
    let detailLines: [String]?
    let exampleTemplate: ExampleTemplate?
    let objects: [TextObject]
}

guard CommandLine.arguments.count == 3 else {
    fputs("Usage: render-label.swift <input.json> <output.png>\n", stderr)
    exit(1)
}

let inputPath = CommandLine.arguments[1]
let outputPath = CommandLine.arguments[2]
let data = try Data(contentsOf: URL(fileURLWithPath: inputPath))
let spec = try JSONDecoder().decode(RenderSpec.self, from: data)

let size = NSSize(width: spec.width, height: spec.height)
let image = NSImage(size: size)
image.lockFocus()

NSColor.white.setFill()
NSBezierPath(rect: NSRect(origin: .zero, size: size)).fill()
let frame = NSRect(origin: .zero, size: size)

if spec.objects.isEmpty {
    if !spec.focusName.isEmpty {
        drawBadge(
            name: spec.focusName,
            department: spec.focusDepartment,
            in: frame,
            rotated: spec.rotateText ?? false
        )
    } else {
        drawFallbackText(spec.fallbackText, in: frame)
    }
} else {
    if !spec.focusName.isEmpty {
        drawBadge(
            name: spec.focusName,
            department: spec.focusDepartment,
            in: frame,
            rotated: spec.rotateText ?? false
        )
    } else {
        let scaleX = frame.width / max(spec.sourceWidth, 1)
        let scaleY = frame.height / max(spec.sourceHeight, 1)

        for object in spec.objects {
            let rect = NSRect(
                x: frame.minX + CGFloat(object.x) * scaleX,
                y: frame.maxY - CGFloat(object.y + object.height) * scaleY,
                width: max(CGFloat(object.width) * scaleX, 24),
                height: max(CGFloat(object.height) * scaleY, 18)
            )

            drawTextObject(object, in: rect, scaleY: scaleY)
        }
    }
}

image.unlockFocus()

guard
    let tiff = image.tiffRepresentation,
    let bitmap = NSBitmapImageRep(data: tiff),
    let png = bitmap.representation(using: .png, properties: [:])
else {
    fputs("Failed to create PNG output\n", stderr)
    exit(1)
}

try png.write(to: URL(fileURLWithPath: outputPath))

func drawFallbackText(_ text: String, in rect: NSRect) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    paragraph.lineBreakMode = .byWordWrapping

    let attrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: 20, weight: .semibold),
        .foregroundColor: NSColor.black,
        .paragraphStyle: paragraph
    ]

    let insetRect = rect.insetBy(dx: 16, dy: 16)
    let textValue = NSString(string: text)
    let measured = textValue.boundingRect(
        with: insetRect.size,
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        attributes: attrs
    )
    let drawRect = NSRect(
        x: insetRect.minX,
        y: insetRect.minY + max((insetRect.height - measured.height) / 2, 0),
        width: insetRect.width,
        height: max(measured.height, insetRect.height)
    )
    textValue.draw(in: drawRect, withAttributes: attrs)
}

func drawBadge(name: String, department: String, in rect: NSRect, rotated: Bool) {
    if (spec.templateMode ?? "") == "icf-kids-child" {
        drawKidsBadge(
            name: name,
            headerTitle: spec.headerTitle ?? "ICF Kids",
            securityCode: spec.securityCode ?? "",
            detailLines: spec.detailLines ?? [],
            in: rect,
            parentCopy: false
        )
        return
    }

    if (spec.templateMode ?? "") == "icf-kids-parent" {
        drawKidsBadge(
            name: name,
            headerTitle: spec.headerTitle ?? "ICF Kids Parent Copy",
            securityCode: spec.securityCode ?? "",
            detailLines: spec.detailLines ?? [],
            in: rect,
            parentCopy: true
        )
        return
    }

    if (spec.templateMode ?? "") == "icf-checkin-app" {
        drawCheckinAppBadge(name: name, department: department, in: rect, logoPath: spec.logoPath)
        return
    }

    if (spec.templateMode ?? "") == "icf-lbx-exact" {
        drawLBXExactBadge(name: name, department: department, in: rect, logoPath: spec.logoPath)
        return
    }

    if (spec.templateMode ?? "") == "icf-fixed" {
        drawFixedBadge(name: name, department: department, in: rect, logoPath: spec.logoPath)
        return
    }

    if rotated {
        NSGraphicsContext.saveGraphicsState()
        let transform = NSAffineTransform()
        transform.translateX(by: rect.midX, yBy: rect.midY)
        transform.rotate(byDegrees: -90)
        transform.translateX(by: -rect.height / 2, yBy: -rect.width / 2)
        transform.concat()

        let rotatedRect = NSRect(x: 0, y: 0, width: rect.height, height: rect.width)
        drawBadgeContents(name: name, department: department, in: rotatedRect)
        NSGraphicsContext.restoreGraphicsState()
    } else {
        drawBadgeContents(name: name, department: department, in: rect)
    }
}

func drawCheckinAppBadge(name: String, department: String, in rect: NSRect, logoPath: String?) {
    let black = NSColor(calibratedWhite: 0.0, alpha: 1.0)
    let white = NSColor.white
    let isSquareBadge = abs(rect.width - rect.height) < max(rect.width, rect.height) * 0.12
    let isShortBadge = rect.width > rect.height * 1.25

    let headerHeight = rect.height * (isSquareBadge ? 0.20 : (isShortBadge ? 0.22 : 0.16))
    let margin = rect.width * (isSquareBadge ? 0.05 : 0.045)

    black.setFill()
    NSBezierPath(rect: NSRect(x: rect.minX, y: rect.maxY - headerHeight, width: rect.width, height: headerHeight)).fill()

    let titleFontSize = min(
        rect.width * (isSquareBadge ? 0.090 : (isShortBadge ? 0.090 : 0.100)),
        isSquareBadge ? 62 : (isShortBadge ? 58 : 72)
    )

    drawTextBlock(
        spec.churchName ?? "ICF TEL AVIV",
        in: NSRect(
            x: rect.width * (isSquareBadge ? 0.03 : (isShortBadge ? 0.05 : 0.08)),
            y: rect.maxY - headerHeight + headerHeight * (isSquareBadge ? 0.18 : (isShortBadge ? 0.16 : 0.08)),
            width: rect.width * (isSquareBadge ? 0.94 : (isShortBadge ? 0.90 : 0.84)),
            height: headerHeight * (isSquareBadge ? 0.58 : (isShortBadge ? 0.60 : 0.82))
        ),
        fontName: "",
        fontSize: titleFontSize,
        weight: .bold,
        align: .center,
        color: white
    )

    let nameY = isSquareBadge
        ? rect.minY + rect.height * 0.39
        : (isShortBadge
            ? rect.minY + rect.height * 0.34
            : rect.maxY - headerHeight - rect.height * 0.35)
    let nameHeight = isSquareBadge
        ? rect.height * 0.26
        : (isShortBadge ? rect.height * 0.28 : rect.height * 0.24)
    let nameRect = NSRect(
        x: margin,
        y: nameY,
        width: rect.width - margin * 2,
        height: nameHeight
    )
    drawTrackedCenteredText(
        name.uppercased(),
        in: nameRect,
        fontSize: min(
            rect.width * (isSquareBadge ? 0.27 : (isShortBadge ? 0.33 : 0.23)),
            isSquareBadge ? 182 : (isShortBadge ? 224 : 164)
        ),
        weight: .bold,
        color: black,
        tracking: max(
            rect.width * (isSquareBadge ? 0.0015 : (isShortBadge ? 0.001 : 0.014)),
            isSquareBadge ? 1 : (isShortBadge ? 0.5 : 10)
        )
    )

    if !department.isEmpty {
        let departmentY = isSquareBadge
            ? rect.minY + rect.height * 0.20
            : (isShortBadge ? rect.minY + rect.height * 0.15 : nameRect.minY - rect.height * 0.22)
        let departmentHeight = isSquareBadge
            ? rect.height * 0.14
            : (isShortBadge ? rect.height * 0.18 : rect.height * 0.14)
        let groupRect = NSRect(
            x: margin,
            y: departmentY,
            width: rect.width - margin * 2,
            height: departmentHeight
        )
        drawTrackedCenteredText(
            department.uppercased(),
            in: groupRect,
            fontSize: min(
                rect.width * (isSquareBadge ? 0.15 : (isShortBadge ? 0.20 : 0.14)),
                isSquareBadge ? 104 : (isShortBadge ? 138 : 96)
            ),
            weight: .bold,
            color: black,
            tracking: max(
                rect.width * (isSquareBadge ? 0.001 : (isShortBadge ? 0.0008 : 0.010)),
                isSquareBadge ? 0.5 : (isShortBadge ? 0.4 : 6)
            )
        )
    }
}

func drawKidsBadge(
    name: String,
    headerTitle: String,
    securityCode: String,
    detailLines: [String],
    in rect: NSRect,
    parentCopy: Bool
) {
    let black = NSColor.black
    let white = NSColor.white
    let margin = rect.width * 0.06
    let headerHeight = rect.height * 0.24
    let contentWidth = rect.width - margin * 2

    black.setFill()
    NSBezierPath(rect: NSRect(x: rect.minX, y: rect.maxY - headerHeight, width: rect.width, height: headerHeight)).fill()

    let headerTextRect = NSRect(
        x: rect.minX + rect.width * 0.05,
        y: rect.maxY - headerHeight + headerHeight * 0.16,
        width: rect.width * 0.90,
        height: headerHeight * 0.60
    )

    drawTextBlock(
        headerTitle,
        in: headerTextRect,
        fontName: "",
        fontSize: min(rect.height * 0.135, 60),
        weight: .bold,
        align: .center,
        color: white
    )

    let nameRect = NSRect(
        x: rect.minX + margin,
        y: rect.minY + rect.height * (parentCopy ? 0.49 : 0.51),
        width: contentWidth,
        height: rect.height * 0.22
    )
    drawTrackedCenteredText(
        name.uppercased(),
        in: nameRect,
        fontSize: min(rect.height * 0.26, 122),
        weight: .bold,
        color: black,
        tracking: max(rect.width * 0.0025, 1.2)
    )

    let codeBoxHeight = rect.height * (parentCopy ? 0.13 : 0.14)
    let showsSecurityCode = !parentCopy && !securityCode.isEmpty
    let codeBoxRect = NSRect(
        x: rect.midX - rect.width * 0.18,
        y: rect.minY + rect.height * (parentCopy ? 0.34 : 0.33),
        width: rect.width * 0.36,
        height: codeBoxHeight
    )

    if showsSecurityCode {
        drawTextBlock(
            "#\(securityCode)",
            in: codeBoxRect.insetBy(dx: 8, dy: 4),
            fontName: "",
            fontSize: min(codeBoxHeight * 0.60, 46),
            weight: .bold,
            align: .center
        )
    }

    let lines = detailLines.filter { !$0.isEmpty }
    let detailsTop = rect.minY + rect.height * (parentCopy ? 0.07 : 0.04)
    let detailsBottom = showsSecurityCode ? codeBoxRect.minY - rect.height * 0.02 : rect.minY + rect.height * 0.33
    let detailsHeight = max(detailsBottom - detailsTop, rect.height * 0.14)
    let lineGap = rect.height * (parentCopy ? 0.014 : 0.026)
    let totalGap = lineGap * CGFloat(max(lines.count - 1, 0))
    let lineHeight = max((detailsHeight - totalGap) / CGFloat(max(lines.count, 1)), rect.height * 0.07)
    let detailWeight: NSFont.Weight = parentCopy ? .semibold : .medium
    let detailFontSize = min(rect.height * (parentCopy ? 0.090 : 0.098), parentCopy ? 44 : 49)

    for (index, line) in lines.enumerated() {
        let reverseIndex = CGFloat(lines.count - index - 1)
        let lineRect = NSRect(
            x: rect.minX + margin,
            y: detailsTop + (lineHeight + lineGap) * reverseIndex,
            width: contentWidth,
            height: lineHeight
        )
        drawTextBlock(
            line,
            in: lineRect,
            fontName: "",
            fontSize: detailFontSize,
            weight: detailWeight,
            align: .center,
            color: isCheckoutLine(line) ? NSColor.systemRed : black
        )
    }
}

func isCheckoutLine(_ text: String) -> Bool {
    String(text).localizedCaseInsensitiveContains("Забрать детей")
}

func drawLBXExactBadge(name: String, department: String, in rect: NSRect, logoPath: String?) {
    guard let template = spec.exampleTemplate else {
        drawFixedBadge(name: name, department: department, in: rect, logoPath: logoPath)
        return
    }

    let bg = template.background
    let bgWidth = max(CGFloat(bg.width), 1)
    let bgHeight = max(CGFloat(bg.height), 1)
    let scale = min(rect.width / bgWidth, rect.height / bgHeight)
    let templateFrame = NSRect(
        x: rect.midX - (bgWidth * scale) / 2,
        y: rect.midY - (bgHeight * scale) / 2,
        width: bgWidth * scale,
        height: bgHeight * scale
    )

    func mapRect(x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat) -> NSRect {
        NSRect(
            x: templateFrame.minX + (x - CGFloat(bg.x)) * scale,
            y: templateFrame.maxY - ((y - CGFloat(bg.y)) + height) * scale,
            width: width * scale,
            height: height * scale
        )
    }

    let imageTemplate = template.image
    let logoRect = mapRect(
        x: CGFloat(imageTemplate.x),
        y: CGFloat(imageTemplate.y),
        width: CGFloat(imageTemplate.width),
        height: CGFloat(imageTemplate.height)
    )

    if let logoPath, !logoPath.isEmpty, let image = NSImage(contentsOfFile: logoPath) {
        drawRotatedImage(image, in: logoRect, degrees: CGFloat(imageTemplate.angle) * -1)
    }

    for textTemplate in template.texts {
        let targetText: String
        if textTemplate.placeholder.contains("name") {
            targetText = name
        } else {
            targetText = department
        }

        let textRect = mapRect(
            x: CGFloat(textTemplate.x),
            y: CGFloat(textTemplate.y),
            width: CGFloat(textTemplate.width),
            height: CGFloat(textTemplate.height)
        )

        drawRotatedText(
            targetText,
            in: textRect,
            fontName: textTemplate.fontName,
            fontSize: max(CGFloat(textTemplate.fontSize) * scale, 8),
            weight: textTemplate.weight >= 600 ? .bold : .regular,
            align: alignment(from: textTemplate.align),
            degrees: CGFloat(textTemplate.angle) * -1
        )
    }
}

func drawFixedBadge(name: String, department: String, in rect: NSRect, logoPath: String?) {
    NSGraphicsContext.saveGraphicsState()
    let transform = NSAffineTransform()
    transform.translateX(by: rect.midX, yBy: rect.midY)
    transform.rotate(byDegrees: 90)
    transform.translateX(by: -rect.height / 2, yBy: -rect.width / 2)
    transform.concat()

    let rotatedRect = NSRect(x: 0, y: 0, width: rect.height, height: rect.width)
    let contentWidth = rotatedRect.width * 0.92
    let contentX = max((rotatedRect.width - contentWidth) / 2 - rotatedRect.width * 0.10, 0)

    let logoRect = NSRect(
        x: rotatedRect.midX - contentWidth * 0.22,
        y: rotatedRect.maxY - rotatedRect.height * 0.18,
        width: contentWidth * 0.44,
        height: rotatedRect.height * 0.14
    )

    let nameRect = NSRect(
        x: contentX,
        y: rotatedRect.minY + rotatedRect.height * 0.30,
        width: contentWidth,
        height: rotatedRect.height * 0.22
    )

    let departmentRect = NSRect(
        x: contentX,
        y: rotatedRect.minY + rotatedRect.height * 0.18,
        width: contentWidth,
        height: rotatedRect.height * 0.14
    )

    if let logoPath, !logoPath.isEmpty, let image = NSImage(contentsOfFile: logoPath) {
        drawFittedImage(image, in: logoRect)
    }

    drawTextBlock(
        name,
        in: nameRect,
        fontName: "",
        fontSize: min(rotatedRect.height * 0.44, 110),
        weight: .bold,
        align: .center
    )

    drawTextBlock(
        department,
        in: departmentRect,
        fontName: "",
        fontSize: min(rotatedRect.height * 0.24, 62),
        weight: .regular,
        align: .center
    )

    NSGraphicsContext.restoreGraphicsState()
}

func drawFittedImage(_ image: NSImage, in rect: NSRect) {
    let imageSize = image.size
    guard imageSize.width > 0, imageSize.height > 0 else { return }

    let widthRatio = rect.width / imageSize.width
    let heightRatio = rect.height / imageSize.height
    let scale = min(widthRatio, heightRatio)
    let drawSize = NSSize(width: imageSize.width * scale, height: imageSize.height * scale)
    let drawRect = NSRect(
        x: rect.midX - drawSize.width / 2,
        y: rect.midY - drawSize.height / 2,
        width: drawSize.width,
        height: drawSize.height
    )

    image.draw(
        in: drawRect,
        from: .zero,
        operation: .sourceOver,
        fraction: 1.0
    )
}

func drawRotatedImage(_ image: NSImage, in rect: NSRect, degrees: CGFloat) {
    NSGraphicsContext.saveGraphicsState()
    let transform = NSAffineTransform()
    transform.translateX(by: rect.midX, yBy: rect.midY)
    transform.rotate(byDegrees: degrees)
    transform.translateX(by: -rect.height / 2, yBy: -rect.width / 2)
    transform.concat()

    image.draw(
        in: NSRect(x: 0, y: 0, width: rect.height, height: rect.width),
        from: .zero,
        operation: .sourceOver,
        fraction: 1.0
    )
    NSGraphicsContext.restoreGraphicsState()
}

func drawRotatedText(
    _ text: String,
    in rect: NSRect,
    fontName: String,
    fontSize: CGFloat,
    weight: NSFont.Weight,
    align: NSTextAlignment,
    degrees: CGFloat = -90
) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = align
    paragraph.lineBreakMode = .byWordWrapping

    let font = NSFont(name: fontName, size: fontSize)
        ?? NSFont.systemFont(ofSize: fontSize, weight: weight)
    let attrs: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: NSColor.black,
        .paragraphStyle: paragraph
    ]

    NSGraphicsContext.saveGraphicsState()
    let transform = NSAffineTransform()
    transform.translateX(by: rect.midX, yBy: rect.midY)
    transform.rotate(byDegrees: degrees)
    transform.translateX(by: -rect.height / 2, yBy: -rect.width / 2)
    transform.concat()

    let drawRect = NSRect(
        x: 0,
        y: 0,
        width: rect.height,
        height: rect.width
    )
    NSString(string: text).draw(in: drawRect, withAttributes: attrs)
    NSGraphicsContext.restoreGraphicsState()
}

func drawTextBlock(
    _ text: String,
    in rect: NSRect,
    fontName: String,
    fontSize: CGFloat,
    weight: NSFont.Weight,
    align: NSTextAlignment,
    color: NSColor = .black
) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = align
    paragraph.lineBreakMode = .byWordWrapping

    let font = NSFont(name: fontName, size: fontSize)
        ?? NSFont.systemFont(ofSize: fontSize, weight: weight)
    let attrs: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: color,
        .paragraphStyle: paragraph
    ]

    let textValue = NSString(string: text)
    let measured = textValue.boundingRect(
        with: rect.size,
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        attributes: attrs
    )

    let drawRect = NSRect(
        x: rect.minX,
        y: rect.minY + max((rect.height - measured.height) / 2, 0),
        width: rect.width,
        height: max(measured.height, rect.height)
    )
    textValue.draw(in: drawRect, withAttributes: attrs)
}

func drawTrackedCenteredText(
    _ text: String,
    in rect: NSRect,
    fontSize: CGFloat,
    weight: NSFont.Weight,
    color: NSColor,
    tracking: CGFloat
) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    paragraph.lineBreakMode = .byWordWrapping

    var currentFontSize = fontSize
    var attrs: [NSAttributedString.Key: Any] = [:]
    var measured = NSRect.zero

    while currentFontSize > 8 {
        let font = NSFont.systemFont(ofSize: currentFontSize, weight: weight)
        attrs = [
            .font: font,
            .foregroundColor: color,
            .paragraphStyle: paragraph,
            .kern: tracking
        ]
        measured = NSString(string: text).boundingRect(
            with: NSSize(width: rect.width, height: rect.height * 3),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: attrs
        )
        if measured.width <= rect.width && measured.height <= rect.height {
            break
        }
        currentFontSize -= 2
    }

    let drawRect = NSRect(
        x: rect.minX,
        y: rect.minY + max((rect.height - measured.height) / 2, 0),
        width: rect.width,
        height: min(measured.height, rect.height)
    )
    NSString(string: text).draw(in: drawRect, withAttributes: attrs)
}

func alignment(from value: String) -> NSTextAlignment {
    switch value.lowercased() {
    case "center":
        return .center
    case "right":
        return .right
    default:
        return .center
    }
}

func drawBadgeContents(name: String, department: String, in rect: NSRect) {
    let nameParagraph = NSMutableParagraphStyle()
    nameParagraph.alignment = .center
    nameParagraph.lineBreakMode = .byWordWrapping

    let nameFont = NSFont.systemFont(ofSize: min(rect.height * 0.42, 132), weight: .bold)
    let nameAttrs: [NSAttributedString.Key: Any] = [
        .font: nameFont,
        .foregroundColor: NSColor.black,
        .paragraphStyle: nameParagraph
    ]

    let departmentParagraph = NSMutableParagraphStyle()
    departmentParagraph.alignment = .center
    departmentParagraph.lineBreakMode = .byWordWrapping

    let departmentFont = NSFont.systemFont(ofSize: min(rect.height * 0.20, 52), weight: .medium)
    let departmentAttrs: [NSAttributedString.Key: Any] = [
        .font: departmentFont,
        .foregroundColor: NSColor.black,
        .paragraphStyle: departmentParagraph
    ]

    let nameText = NSString(string: name)
    let nameSize = nameText.boundingRect(
        with: NSSize(width: rect.width - 36, height: rect.height),
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        attributes: nameAttrs
    ).size

    let departmentText = NSString(string: department)
    let departmentSize = departmentText.boundingRect(
        with: NSSize(width: rect.width - 36, height: rect.height),
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        attributes: departmentAttrs
    ).size

    let gap: CGFloat = department.isEmpty ? 0 : 22
    let totalHeight = nameSize.height + departmentSize.height + gap
    let startY = rect.minY + max((rect.height - totalHeight) / 2, 0)

    let nameRect = NSRect(
        x: rect.minX + 18,
        y: startY + departmentSize.height + gap,
        width: rect.width - 36,
        height: nameSize.height
    )
    nameText.draw(in: nameRect, withAttributes: nameAttrs)

    if !department.isEmpty {
        let departmentRect = NSRect(
            x: rect.minX + 18,
            y: startY,
            width: rect.width - 36,
            height: departmentSize.height
        )
        departmentText.draw(in: departmentRect, withAttributes: departmentAttrs)
    }
}

func drawTextObject(_ object: RenderSpec.TextObject, in rect: NSRect, scaleY: CGFloat) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = alignment(for: object.horizontalAlignment)
    paragraph.lineBreakMode = .byWordWrapping

    let fontSize = max(CGFloat(object.fontSize) * scaleY * 1.2, 11)
    let font = NSFont(name: object.family, size: fontSize)
        ?? NSFont.systemFont(ofSize: fontSize, weight: object.bold ? .bold : .regular)

    let attrs: [NSAttributedString.Key: Any] = [
        .font: object.bold ? boldVersion(of: font) : font,
        .foregroundColor: NSColor.black,
        .paragraphStyle: paragraph
    ]

    let text = NSString(string: object.text)
    let textSize = text.boundingRect(
        with: rect.size,
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        attributes: attrs
    ).size

    var drawRect = rect
    if object.verticalAlignment.lowercased() == "middle" {
        drawRect.origin.y += max((rect.height - textSize.height) / 2, 0)
    }

    text.draw(in: drawRect, withAttributes: attrs)
}

func alignment(for value: String) -> NSTextAlignment {
    switch value.lowercased() {
    case "center":
        return .center
    case "right":
        return .right
    default:
        return .center
    }
}

func boldVersion(of font: NSFont) -> NSFont {
    let manager = NSFontManager.shared
    return manager.convert(font, toHaveTrait: .boldFontMask)
}
