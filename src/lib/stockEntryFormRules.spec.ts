import { describe, expect, it } from "vitest";
import { buildStockEntryPayload, validateStockEntryForm, type StockEntryFormState } from "./stockEntryFormRules";

const baseForm: StockEntryFormState = {
  entry_type: "ISSUE",
  issue_target: "STORE",
  return_source: "PERSON",
  from_location: "10",
  to_location: "20",
  issued_to: "",
  status: "DRAFT",
  purpose: "Lab movement",
  remarks: "",
  items: [
    {
      item: "3",
      batch: "",
      quantity: "2",
      instances: ["4", "5"],
      stock_register: "",
      page_number: "",
    },
  ],
};

describe("stock entry form rules", () => {
  it("builds issue payloads with source store and person recipient", () => {
    expect(
      buildStockEntryPayload({
        ...baseForm,
        issue_target: "PERSON",
        to_location: "",
        issued_to: "7",
      }),
    ).toMatchObject({
      entry_type: "ISSUE",
      from_location: 10,
      to_location: null,
      issued_to: 7,
      status: "COMPLETED",
    });
  });

  it("builds store-transfer issue payloads as pending acknowledgement", () => {
    expect(
      buildStockEntryPayload({
        ...baseForm,
        status: "COMPLETED",
        issue_target: "STORE",
      }),
    ).toMatchObject({
      entry_type: "ISSUE",
      from_location: 10,
      to_location: 20,
      status: "PENDING_ACK",
    });
  });

  it("builds receipt payloads with receiving store and person return source", () => {
    expect(
      buildStockEntryPayload({
        ...baseForm,
        entry_type: "RECEIPT",
        return_source: "PERSON",
        from_location: "",
        to_location: "10",
        issued_to: "7",
      }),
    ).toMatchObject({
      entry_type: "RECEIPT",
      from_location: null,
      to_location: 10,
      issued_to: 7,
      status: "PENDING_ACK",
    });
  });

  it("builds receipt payloads with receiving store and non-store return source", () => {
    expect(
      buildStockEntryPayload({
        ...baseForm,
        entry_type: "RECEIPT",
        return_source: "LOCATION",
        from_location: "33",
        to_location: "10",
        issued_to: "",
      }),
    ).toMatchObject({
      entry_type: "RECEIPT",
      from_location: 33,
      to_location: 10,
      issued_to: null,
    });
  });

  it("includes selected instance ids in line item payloads", () => {
    expect(buildStockEntryPayload(baseForm).items[0]).toMatchObject({
      instances: [4, 5],
    });
  });

  it("validates receipt fields independently from issue source-store fields", () => {
    expect(
      validateStockEntryForm({
        ...baseForm,
        entry_type: "RECEIPT",
        return_source: "PERSON",
        from_location: "",
        to_location: "",
        issued_to: "",
      }),
    ).toMatchObject({
      to_location: "Choose the receiving store.",
      issued_to: "Choose the person returning stock.",
    });
  });
});
