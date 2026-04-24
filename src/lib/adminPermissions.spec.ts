import { describe, expect, it } from "vitest";
import { ADMIN_PERMISSIONS, PROTECTED_ADMIN_ROUTES } from "./adminPermissions";

describe("admin permissions items module", () => {
  it("protects the items route with the domain view permission", () => {
    expect(ADMIN_PERMISSIONS.items.view).toBe("inventory.view_items");
    expect(PROTECTED_ADMIN_ROUTES["/items"]).toBe("inventory.view_items");
  });
});
