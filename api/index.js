import { handleRequest } from "../index.js";

export default function handler(request, response) {
  if (request.url?.startsWith("/api/index.js?")) {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const path = url.searchParams.get("path") || "";
    request.url = `/api/${path}`;
  }
  return handleRequest(request, response);
}
