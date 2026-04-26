import { describe, expect, it } from "vitest";
import { filterStockRegisters, getActiveStoreOptions } from "./stockRegisterUi";

const registers = [
  {
    id: 1,
    register_number: "CSR-CSIT-1",
    register_type: "CSR",
    store: 11,
    store_name: "CSIT Main Store",
    is_active: true,
    created_at: "2026-04-26T10:00:00Z",
    updated_at: "2026-04-26T10:00:00Z",
  },
  {
    id: 2,
    register_number: "DSR-EE-1",
    register_type: "DSR",
    store: 22,
    store_name: "Electrical Main Store",
    is_active: true,
    created_at: "2026-04-26T10:00:00Z",
    updated_at: "2026-04-26T10:00:00Z",
  },
  {
    id: 3,
    register_number: "CSR-ARCHIVE-1",
    register_type: "CSR",
    store: 33,
    store_name: "Archive Store",
    is_active: false,
    created_at: "2026-04-26T10:00:00Z",
    updated_at: "2026-04-26T10:00:00Z",
  },
];

const locations = [
  {
    id: 11,
    name: "CSIT Main Store",
    code: "STR-0011",
    parent_location: 10,
    location_type: "STORE",
    description: null,
    address: null,
    in_charge: null,
    contact_number: null,
    is_active: true,
    is_store: true,
    is_standalone: false,
    hierarchy_level: 2,
    updated_at: "2026-04-26T10:00:00Z",
  },
  {
    id: 12,
    name: "CSIT Department",
    code: "DEPT-0012",
    parent_location: 1,
    location_type: "DEPARTMENT",
    description: null,
    address: null,
    in_charge: null,
    contact_number: null,
    is_active: true,
    is_store: false,
    is_standalone: true,
    hierarchy_level: 1,
    updated_at: "2026-04-26T10:00:00Z",
  },
  {
    id: 22,
    name: "Electrical Main Store",
    code: "STR-0022",
    parent_location: 20,
    location_type: "STORE",
    description: null,
    address: null,
    in_charge: null,
    contact_number: null,
    is_active: true,
    is_store: true,
    is_standalone: false,
    hierarchy_level: 2,
    updated_at: "2026-04-26T10:00:00Z",
  },
  {
    id: 33,
    name: "Archive Store",
    code: "STR-0033",
    parent_location: 30,
    location_type: "STORE",
    description: null,
    address: null,
    in_charge: null,
    contact_number: null,
    is_active: false,
    is_store: true,
    is_standalone: false,
    hierarchy_level: 2,
    updated_at: "2026-04-26T10:00:00Z",
  },
];

describe("stock register UI helpers", () => {
  it("filters registers by search text, type, and status", () => {
    expect(
      filterStockRegisters(registers, {
        search: "ee",
        typeFilter: "DSR",
        statusFilter: "active",
      }).map(register => register.id),
    ).toEqual([2]);
  });

  it("returns only active store options sorted by name", () => {
    expect(getActiveStoreOptions(locations).map(location => location.name)).toEqual([
      "CSIT Main Store",
      "Electrical Main Store",
    ]);
  });
});
