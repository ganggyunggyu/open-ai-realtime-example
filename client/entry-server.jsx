import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import Root from "@/pages/Root";

export function render(url = "/") {
  const pathname = typeof url === "string" ? url.split("?")[0] : "/";
  const html = renderToString(
    <StrictMode>
      <Root pathname={pathname} />
    </StrictMode>,
  );
  return { html };
}
