// fn-monitor — reports the macOS fn/Globe key to TapWisper.
//
// libuiohook (used for every other shortcut) never emits an event for fn, so
// this tiny helper listens with a passive (listen-only) event tap and prints:
//   down        fn/Globe pressed
//   up          fn/Globe released
//   key <code>  another key pressed while fn is held (Space = 49)
// It never blocks or changes events. It exits when stdin closes (TapWisper
// quit or replaced it). Needs the same Accessibility/Input Monitoring
// permission TapWisper already has (TCC attributes it to the parent app).

import Cocoa

setvbuf(stdout, nil, _IOLBF, 0)

/// kVK_Function; newer keyboards' Globe key reports the same code
let functionKeyCodes: Set<Int64> = [63, 179]
var fnDown = false
var eventTap: CFMachPort?

func emit(_ line: String) {
    print(line)
}

let callback: CGEventTapCallBack = { _, type, event, _ in
    switch type {
    case .tapDisabledByTimeout, .tapDisabledByUserInput:
        // The system disables slow taps; turn it straight back on
        if let tap = eventTap { CGEvent.tapEnable(tap: tap, enable: true) }
    case .flagsChanged:
        let keycode = event.getIntegerValueField(.keyboardEventKeycode)
        if functionKeyCodes.contains(keycode) {
            let isDown = event.flags.contains(.maskSecondaryFn)
            if isDown != fnDown {
                fnDown = isDown
                emit(isDown ? "down" : "up")
            }
        }
    case .keyDown:
        if fnDown && event.getIntegerValueField(.keyboardEventAutorepeat) == 0 {
            emit("key \(event.getIntegerValueField(.keyboardEventKeycode))")
        }
    default:
        break
    }
    return Unmanaged.passUnretained(event)
}

let mask: CGEventMask =
    (1 << CGEventType.flagsChanged.rawValue) | (1 << CGEventType.keyDown.rawValue)

guard let tap = CGEvent.tapCreate(
    tap: .cgSessionEventTap,
    place: .headInsertEventTap,
    options: .listenOnly,
    eventsOfInterest: mask,
    callback: callback,
    userInfo: nil
) else {
    FileHandle.standardError.write("fn-monitor: cannot create event tap (permission?)\n".data(using: .utf8)!)
    exit(2)
}
eventTap = tap

let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)

// Exit with the parent: stdin reaches EOF when TapWisper closes the pipe or dies
DispatchQueue.global(qos: .background).async {
    while FileHandle.standardInput.availableData.count > 0 {}
    exit(0)
}

CFRunLoopRun()
