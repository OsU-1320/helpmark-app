/** Web NFC API（NDEFReader）の最小型宣言。標準lib.domに未収録のため */
interface NDEFRecord {
  readonly recordType: string
  readonly data?: DataView
}

interface NDEFMessage {
  readonly records: ReadonlyArray<NDEFRecord>
}

interface NDEFReadingEvent extends Event {
  readonly message: NDEFMessage
}

interface NDEFReader extends EventTarget {
  scan(options?: { signal?: AbortSignal }): Promise<void>
  onreading: ((event: NDEFReadingEvent) => void) | null
  onreadingerror: ((event: Event) => void) | null
}

declare var NDEFReader: {
  prototype: NDEFReader
  new (): NDEFReader
}
