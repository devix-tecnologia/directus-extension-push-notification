import { describe, it, expect } from "vitest";
import { resolveIconUrl } from "../../src/notification-trigger/resolve-icon.js";

const NOTIFICATION_ID = "notif-abc-123";
const FILE_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const EXTERNAL_URL = "https://example.com/icon.png";
const ICON_ENDPOINT = `/push-notification/icon/${NOTIFICATION_ID}`;
const FALLBACK = "/admin/favicon.ico";

describe("resolveIconUrl", () => {
  describe("arquivo do Directus", () => {
    it("resolve para o endpoint, que serve o asset como proxy", () => {
      expect(
        resolveIconUrl({ notification_id: NOTIFICATION_ID, icon: FILE_ID }),
      ).toBe(ICON_ENDPOINT);
    });

    it("tem prioridade sobre a URL externa", () => {
      expect(
        resolveIconUrl({
          notification_id: NOTIFICATION_ID,
          icon: FILE_ID,
          icon_url: EXTERNAL_URL,
        }),
      ).toBe(ICON_ENDPOINT);
    });
  });

  describe("URL externa", () => {
    it("vai direto no payload, sem desviar pelo endpoint", () => {
      expect(
        resolveIconUrl({
          notification_id: NOTIFICATION_ID,
          icon_url: EXTERNAL_URL,
        }),
      ).toBe(EXTERNAL_URL);
    });

    it("é usada quando icon vem vazio", () => {
      expect(
        resolveIconUrl({
          notification_id: NOTIFICATION_ID,
          icon: "",
          icon_url: EXTERNAL_URL,
        }),
      ).toBe(EXTERNAL_URL);
    });

    it("é usada quando icon vem null", () => {
      expect(
        resolveIconUrl({
          notification_id: NOTIFICATION_ID,
          icon: null,
          icon_url: EXTERNAL_URL,
        }),
      ).toBe(EXTERNAL_URL);
    });

    it("dispensa notification_id, já que não depende do endpoint", () => {
      expect(resolveIconUrl({ icon_url: EXTERNAL_URL })).toBe(EXTERNAL_URL);
    });
  });

  describe("fallback", () => {
    it("sem ícone algum", () => {
      expect(resolveIconUrl({ notification_id: NOTIFICATION_ID })).toBe(
        FALLBACK,
      );
    });

    it("com ambos null", () => {
      expect(
        resolveIconUrl({
          notification_id: NOTIFICATION_ID,
          icon: null,
          icon_url: null,
        }),
      ).toBe(FALLBACK);
    });

    it("com ambos vazios", () => {
      expect(
        resolveIconUrl({
          notification_id: NOTIFICATION_ID,
          icon: "",
          icon_url: "",
        }),
      ).toBe(FALLBACK);
    });

    it("com arquivo mas sem notification_id, que o endpoint exige", () => {
      expect(resolveIconUrl({ notification_id: null, icon: FILE_ID })).toBe(
        FALLBACK,
      );
    });
  });
});
