/**
 * Minimal text/event-stream reader: yields the `data` of each event. Comment lines (": …",
 * used by some providers as keep-alives) and other fields (event, id, retry) are ignored.
 */
export async function* readSse(body: AsyncIterable<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  let data: string[] = [];

  function* handle(line: string): Generator<string> {
    if (line === "") {
      if (data.length) yield data.join("\n");
      data = [];
    } else if (line.startsWith("data:")) {
      data.push(line.slice(line.startsWith("data: ") ? 6 : 5));
    }
  }

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r\n|\r|\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) yield* handle(line);
  }
  buffer += decoder.decode();
  if (buffer) yield* handle(buffer);
  yield* handle("");
}
