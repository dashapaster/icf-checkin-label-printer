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
    paragraph.alignment = .left
    paragraph.lineBreakMode = .byWordWrapping

    let attrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: 20, weight: .semibold),
        .foregroundColor: NSColor.black,
        .paragraphStyle: paragraph
    ]

    NSString(string: text).draw(in: rect.insetBy(dx: 16, dy: 16), withAttributes: attrs)
}

func drawBadge(name: String, department: String, in rect: NSRect, rotated: Bool) {
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

    let headerHeight = rect.height * 0.13
    let margin = rect.width * 0.045

    black.setFill()
    NSBezierPath(rect: NSRect(x: rect.minX, y: rect.maxY - headerHeight, width: rect.width, height: headerHeight)).fill()

    let titleFontSize = min(rect.width * 0.058, 30)

    drawTextBlock(
        spec.churchName ?? "ICF TEL AVIV",
        in: NSRect(
            x: rect.width * 0.04,
            y: rect.maxY - headerHeight + headerHeight * 0.14,
            width: rect.width * 0.92,
            height: headerHeight * 0.72
        ),
        fontName: "",
        fontSize: titleFontSize,
        weight: .bold,
        align: .center,
        color: white
    )

    let contentTop = rect.maxY - headerHeight - rect.height * 0.03
    let contentBottom = rect.minY + rect.height * 0.12
    let contentHeight = contentTop - contentBottom

    let nameRect = NSRect(
        x: margin,
        y: contentBottom + contentHeight * 0.43,
        width: rect.width - margin * 2,
        height: contentHeight * 0.37
    )
    drawTrackedCenteredText(
        name.uppercased(),
        in: nameRect,
        fontSize: min(rect.width * 0.16, 78),
        weight: .bold,
        color: black,
        tracking: max(rect.width * 0.004, 2)
    )

    if !department.isEmpty {
        let groupRect = NSRect(
            x: margin,
            y: contentBottom + contentHeight * 0.24,
            width: rect.width - margin * 2,
            height: contentHeight * 0.22
        )
        drawTrackedCenteredText(
            department.uppercased(),
            in: groupRect,
            fontSize: min(rect.width * 0.10, 46),
            weight: .bold,
            color: black,
            tracking: max(rect.width * 0.002, 1)
        )
    }
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
    paragraph.lineBreakMode = .byClipping

    let font = NSFont.systemFont(ofSize: fontSize, weight: weight)
    let attrs: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: color,
        .paragraphStyle: paragraph,
        .kern: tracking
    ]

    let drawRect = NSRect(x: rect.minX, y: rect.minY, width: rect.width, height: rect.height)
    NSString(string: text).draw(in: drawRect, withAttributes: attrs)
}

func alignment(from value: String) -> NSTextAlignment {
    switch value.lowercased() {
    case "center":
        return .center
    case "right":
        return .right
    default:
        return .left
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
        return .left
    }
}

func boldVersion(of font: NSFont) -> NSFont {
    let manager = NSFontManager.shared
    return manager.convert(font, toHaveTrait: .boldFontMask)
}
