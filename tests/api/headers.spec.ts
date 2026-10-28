import { expect, test } from "@playwright/test";

test("HTML responses carry baseline security headers", async ({ request }) => {
  const res = await request.get("/");
  expect(res.status()).toBe(200);

  const headers = res.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=(self)");
  expect(headers["permissions-policy"]).toContain("microphone=(self)");
  expect(headers["permissions-policy"]).toContain("geolocation=(self)");
  expect(headers["strict-transport-security"]).toContain("max-age=");

  const csp = headers["content-security-policy-report-only"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("https://api.mapbox.com");
});

test("API responses are not cacheable", async ({ request }) => {
  const res = await request.get("/api/poll?id=00000000-0000-4000-8000-000000000000");
  expect(res.headers()["cache-control"]).toContain("no-store");
});

test("the API does not opt into cross-origin access", async ({ request }) => {
  const res = await request.post("/api/leave", {
    headers: { Origin: "https://evil.example" },
    data: { id: "00000000-0000-4000-8000-000000000000" },
  });
  expect(res.headers()["access-control-allow-origin"]).toBeUndefined();
});
