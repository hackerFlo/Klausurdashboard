import CoreGraphics
import Foundation

struct Bounds: Codable {
  let x: Int
  let y: Int
  let width: Int
  let height: Int
}

struct DisplayInfo: Codable {
  let id: UInt32
  let isMain: Bool
  let isMirrored: Bool
  let mirrorOfID: UInt32?
  let bounds: Bounds
}

struct StatusResult: Codable {
  let ok: Bool
  let mainDisplayID: UInt32
  let displays: [DisplayInfo]
}

struct ErrorResult: Codable {
  let ok: Bool
  let error: String
}

func emit<T: Encodable>(_ value: T) {
  let data = try! JSONEncoder().encode(value)
  print(String(data: data, encoding: .utf8)!)
}

func fail(_ message: String) -> Never {
  emit(ErrorResult(ok: false, error: message))
  exit(1)
}

func activeDisplayIDs() -> [CGDirectDisplayID] {
  var count: UInt32 = 0
  CGGetActiveDisplayList(0, nil, &count)
  guard count > 0 else { return [] }
  var ids = [CGDirectDisplayID](repeating: 0, count: Int(count))
  CGGetActiveDisplayList(count, &ids, &count)
  return ids
}

func buildStatus() -> StatusResult {
  let ids = activeDisplayIDs()
  let mainID = CGMainDisplayID()
  let infos = ids.map { id -> DisplayInfo in
    let rect = CGDisplayBounds(id)
    let mirrorTarget = CGDisplayMirrorsDisplay(id)
    let isMirrored = mirrorTarget != kCGNullDirectDisplay
    return DisplayInfo(
      id: id,
      isMain: id == mainID,
      isMirrored: isMirrored,
      mirrorOfID: isMirrored ? mirrorTarget : nil,
      bounds: Bounds(
        x: Int(rect.origin.x), y: Int(rect.origin.y),
        width: Int(rect.width), height: Int(rect.height))
    )
  }
  return StatusResult(ok: true, mainDisplayID: mainID, displays: infos)
}

func runStatus() {
  emit(buildStatus())
}

func runExtend() {
  let before = buildStatus()
  let mirrored = before.displays.filter { $0.isMirrored && !$0.isMain }
  guard !mirrored.isEmpty else {
    emit(before)
    return
  }

  guard let mainInfo = before.displays.first(where: { $0.isMain }) else {
    fail("could not determine main display")
  }

  var config: CGDisplayConfigRef?
  let beginErr = CGBeginDisplayConfiguration(&config)
  guard beginErr == .success, let cfg = config else {
    fail("CGBeginDisplayConfiguration failed: \(beginErr.rawValue)")
  }

  for d in mirrored {
    CGConfigureDisplayMirrorOfDisplay(cfg, d.id, kCGNullDirectDisplay)
  }

  var nextX = mainInfo.bounds.x + mainInfo.bounds.width
  for d in mirrored {
    CGConfigureDisplayOrigin(cfg, d.id, Int32(nextX), Int32(mainInfo.bounds.y))
    nextX += d.bounds.width
  }

  let completeErr = CGCompleteDisplayConfiguration(cfg, .permanently)
  guard completeErr == .success else {
    fail("CGCompleteDisplayConfiguration failed: \(completeErr.rawValue)")
  }

  emit(buildStatus())
}

func runRestore(jsonArg: String?) {
  guard let jsonArg,
    let data = jsonArg.data(using: .utf8),
    let saved = try? JSONDecoder().decode(StatusResult.self, from: data)
  else {
    fail("restore requires valid saved-state JSON as argv[2]")
  }

  let current = Set(activeDisplayIDs())

  var config: CGDisplayConfigRef?
  let beginErr = CGBeginDisplayConfiguration(&config)
  guard beginErr == .success, let cfg = config else {
    fail("CGBeginDisplayConfiguration failed: \(beginErr.rawValue)")
  }

  for d in saved.displays {
    guard current.contains(d.id) else { continue }
    if d.isMirrored, let mirrorOf = d.mirrorOfID, current.contains(mirrorOf) {
      CGConfigureDisplayMirrorOfDisplay(cfg, d.id, mirrorOf)
    } else {
      CGConfigureDisplayMirrorOfDisplay(cfg, d.id, kCGNullDirectDisplay)
      CGConfigureDisplayOrigin(cfg, d.id, Int32(d.bounds.x), Int32(d.bounds.y))
    }
  }

  let completeErr = CGCompleteDisplayConfiguration(cfg, .permanently)
  guard completeErr == .success else {
    fail("CGCompleteDisplayConfiguration failed on restore: \(completeErr.rawValue)")
  }

  print(#"{"ok": true}"#)
}

let args = CommandLine.arguments
guard args.count >= 2 else {
  fail("usage: display-helper <status|extend|restore> [json]")
}

switch args[1] {
case "status":
  runStatus()
case "extend":
  runExtend()
case "restore":
  runRestore(jsonArg: args.count > 2 ? args[2] : nil)
default:
  fail("unknown command: \(args[1])")
}
