import * as React from "react";

const js = String.raw;

export default function StreamInliner({ stream }: { stream: ReadableStream<Uint8Array> }) {
  const decoder = new TextDecoder();
  const reader = stream.getReader();

  return (
    <>
      {/* 返回给客户端的 js runtime */}
      {/* 在客户端 js 代码执行时，会立即创建一个 ReadableStream 挂载在 window._DATA__ 上  */}
      {/* 同时，当 ReadableStream 被创建创建时，会立即在 window 上挂载一个 __DATA_CHUNK__ 方法  */}
      <script
        dangerouslySetInnerHTML={{
          __html: js`
            window.__DATA__ = new ReadableStream({
              start(controller) {
                let encoder = new TextEncoder();
                window.__DATA_CHUNK__ = function(chunk) {
                  if (typeof chunk === "undefined")
                    controller.close();
                  else
                    controller.enqueue(encoder.encode(chunk));
                };
              }
            });
          `
        }}
      />
      {/* 服务端渲染的异步组件，会不停的读取 decoder 的内容同时将获取的返回内容传递给客户端  */}
      <InlineStream decoder={decoder} reader={reader} />
    </>
  );
}

async function InlineStream({
  decoder,
  reader
}: {
  decoder: TextDecoder;
  reader: ReadableStreamDefaultReader<Uint8Array>;
}) {
  const read = await reader.read();
  const decoded = decoder.decode(read.value, { stream: true });

  const script = decoded ? (
    // 读取到 decoded 的内容，则从服务端返回 window.__DATA_CHUNK__(${JSON.stringify(decoded)});
    // 将 streaming 的内容传递给客户端
    <script
      dangerouslySetInnerHTML={{
        __html: `window.__DATA_CHUNK__(${JSON.stringify(decoded)});`
      }}
    />
  ) : null;

  // 当服务端数据读取完成后
  if (read.done) {
    return (
      <>
        {script}
        <script
          dangerouslySetInnerHTML={{ __html: js`window.__DATA_CHUNK__();` }}
        />
      </>
    );
  }

  // 返回的内容，除了 script 脚本外继续递归读取
  return (
    <>
      {script}
      <React.Suspense>
        <InlineStream decoder={decoder} reader={reader} />
      </React.Suspense>
    </>
  );
}

// Taken from https://github.com/cyco130/vite-rsc/blob/2e3d0ad9915e57c4b2eaa3ea24b46c1b477a4cce/packages/fully-react/src/server/htmlescape.ts#L25C1-L38C2
const TERMINATORS_LOOKUP: Record<string, string> = {
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

const TERMINATORS_REGEX = /[\u2028\u2029]/g;

function sanitizer(match: string | number) {
  return TERMINATORS_LOOKUP[match];
}

export function sanitize(str: string) {
  return str.replace(TERMINATORS_REGEX, sanitizer);
}
