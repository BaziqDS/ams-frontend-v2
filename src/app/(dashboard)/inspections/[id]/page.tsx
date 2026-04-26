"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import {
  InspectionIcon,
  InspectionModal,
  RejectInspectionModal,
} from "@/components/inspections/InspectionDialogs";
import { ApiError, apiFetch, type Page } from "@/lib/api";
import { useCapabilities } from "@/contexts/CapabilitiesContext";
import {
  API_BASE,
  canResumeInspectionEditor,
  formatInspectionDate,
  formatInspectionDateShort,
  getInspectionStageEditorLabel,
  getInspectionTotals,
  getInspectionValueTotals,
  getInspectionWorkflowSteps,
  INSPECTION_STAGE_LABELS,
  type InspectionItemOption,
  type InspectionItemRecord,
  type InspectionRecord,
  type InspectionStockRegisterOption,
  type InspectionWorkflowStep,
} from "@/lib/inspectionUi";

function formatInspectionDateTime(value: string | null | undefined) {
  if (!value) return "Pending";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCurrency(value: number) {
  return value.toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatStockEntryTypeLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getLineUnitPrice(unitPrice: number | string) {
  const parsed = typeof unitPrice === "number" ? unitPrice : Number.parseFloat(unitPrice);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDisplayTitle(inspection: InspectionRecord) {
  const primary = inspection.contractor_name?.trim() || inspection.contract_no;
  const secondary = inspection.department_name?.trim();
  return secondary ? `${primary} - ${secondary}` : primary;
}

function getDisplaySubtitle(inspection: InspectionRecord) {
  return (
    `Acceptance inspection of contract ${inspection.contract_no}, vendor ${inspection.contractor_name || "not recorded"}. ` +
    `${inspection.date_of_delivery ? `Delivery received on ${formatInspectionDate(inspection.date_of_delivery)}, ` : "Delivery date not recorded, "}` +
    `currently under ${INSPECTION_STAGE_LABELS[inspection.stage].toLowerCase()}.`
  );
}

function getFiscalYear(value: string | null | undefined) {
  const source = value ? new Date(value) : new Date();
  const year = source.getFullYear();
  const startsNext = source.getMonth() >= 6;
  const startYear = startsNext ? year : year - 1;
  return `FY ${startYear}-${String(startYear + 1).slice(-2)}`;
}

function getRegisterRef(name: string | undefined, fallback: string | null | undefined, page: string | null | undefined) {
  const base = name || fallback;
  if (!base) return "Not recorded";
  return page ? `${base} / pg ${page}` : base;
}

function getFirstRegisterRef(inspection: InspectionRecord, kind: "stock" | "central") {
  const item = inspection.items.find(line => kind === "stock" ? line.stock_register_name || line.stock_register_no : line.central_register_name || line.central_register_no);
  if (!item) return "Not recorded";
  return kind === "stock"
    ? getRegisterRef(item.stock_register_name, item.stock_register_no, item.stock_register_page_no)
    : getRegisterRef(item.central_register_name, item.central_register_no, item.central_register_page_no);
}

function getDocumentHref(file: string) {
  return file.startsWith("http") ? file : `${API_BASE}${file}`;
}

function getDocumentBadge(file: string, label: string | null) {
  const source = (label || file).toLowerCase();
  if (source.endsWith(".pdf")) return "PDF";
  if (source.endsWith(".docx")) return "DOC";
  if (source.endsWith(".xlsx") || source.endsWith(".xls")) return "XLS";
  if (/\.(png|jpe?g|gif|webp)$/.test(source)) return "IMG";
  return "FILE";
}

function getDocumentIconClass(file: string, label: string | null) {
  const badge = getDocumentBadge(file, label).toLowerCase();
  if (badge === "pdf") return "pdf";
  if (badge === "img") return "img";
  if (badge === "xls") return "xls";
  return "";
}

function visibleWorkflowSteps(inspection: InspectionRecord) {
  return getInspectionWorkflowSteps(inspection).filter(step => step.key !== "DRAFT");
}

function getWorkflowStateClass(state: InspectionWorkflowStep["state"]) {
  if (state === "complete") return "done";
  if (state === "current") return "active";
  if (state === "rejected") return "rejected";
  return "";
}

function getStagePillClass(stage: InspectionRecord["stage"]) {
  if (stage === "COMPLETED") return "pill-success";
  if (stage === "REJECTED") return "pill-danger";
  if (stage === "DRAFT") return "pill-draft";
  if (stage === "FINANCE_REVIEW") return "pill-warn";
  return "pill-info";
}

function getStagePillLabel(inspection: InspectionRecord) {
  const steps = visibleWorkflowSteps(inspection);
  const effectiveStage = inspection.stage === "REJECTED" ? inspection.rejection_stage : inspection.stage;
  const index = steps.findIndex(step => step.key === effectiveStage);
  if (inspection.stage === "DRAFT" || index < 0) return INSPECTION_STAGE_LABELS[inspection.stage];
  return `Stage ${index + 1} of ${steps.length} - ${INSPECTION_STAGE_LABELS[effectiveStage ?? inspection.stage]}`;
}

function getStageAction(
  inspection: InspectionRecord | null,
  flags: {
    canActStage1: boolean;
    canActStage2: boolean;
    canActStage3: boolean;
    canActStage4: boolean;
  },
  handlers: {
    handleInitiate: () => void;
    handleSubmitStockDetails: () => void;
    handleSubmitCentralRegister: () => void;
    handleCompleteFinance: () => void;
  },
) {
  if (!inspection) return null;
  if (flags.canActStage1) return { label: "Initiate workflow", onClick: handlers.handleInitiate };
  if (flags.canActStage2) return { label: "Approve & advance to central", onClick: handlers.handleSubmitStockDetails };
  if (flags.canActStage3) return { label: "Approve & advance to Stage 3", onClick: handlers.handleSubmitCentralRegister };
  if (flags.canActStage4) return { label: "Final approval", onClick: handlers.handleCompleteFinance };
  return null;
}

function WorkflowTracker({ inspection }: { inspection: InspectionRecord }) {
  const steps = visibleWorkflowSteps(inspection);
  return (
    <div className="workflow" style={{ gridTemplateColumns: `repeat(${Math.max(steps.length, 1)}, 1fr)` }}>
      {steps.map((step, index) => (
        <div key={step.key} className={`wf-step ${getWorkflowStateClass(step.state)}`}>
          <div className="wf-marker">
            <div className="wf-num">{step.state === "complete" ? "✓" : step.state === "rejected" ? "!" : index + 1}</div>
            <div className="wf-label">{step.label}</div>
          </div>
          <div className="wf-meta">
            {step.state === "current" ? "Current hand-off" : step.state === "complete" ? "Completed workflow step" : step.state === "rejected" ? "Rejected at this step" : "Pending workflow step"}
            <span className="when">
              {step.activityAt
                ? `${formatInspectionDateShort(step.activityAt)} by ${step.ownerLabel ?? "system"}`
                : step.ownerLabel ?? "Pending"}
            </span>
          </div>
          <div className="wf-bar" />
        </div>
      ))}
    </div>
  );
}

function KeyValue({ label, value, sub, span }: { label: string; value: React.ReactNode; sub?: React.ReactNode; span?: number }) {
  return (
    <div className="kv" style={span ? { gridColumn: `span ${span}` } : undefined}>
      <div className="kv-label">{label}</div>
      <div className="kv-value">{value}</div>
      {sub ? <div className="kv-sub">{sub}</div> : null}
    </div>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return <div className="notice notice-danger"><div className="notice-body"><div className="notice-title">Action failed</div><div className="notice-text">{children}</div></div></div>;
}

type StageItemsPayloadMode = "stock" | "central";

function normalizeApiList<T>(data: Page<T> | T[]) {
  return Array.isArray(data) ? data : data.results;
}

function normalizeStageItems(items: InspectionItemRecord[]) {
  return items.map(item => ({
    ...item,
    item: item.item ?? null,
    item_description: item.item_description ?? "",
    item_specifications: item.item_specifications ?? "",
    tendered_quantity: Number(item.tendered_quantity || 0),
    accepted_quantity: Number(item.accepted_quantity || 0),
    rejected_quantity: Number(item.rejected_quantity || 0),
    unit_price: item.unit_price ?? "0.00",
    remarks: item.remarks ?? "",
    stock_register: item.stock_register ?? null,
    stock_register_no: item.stock_register_no ?? "",
    stock_register_page_no: item.stock_register_page_no ?? "",
    stock_entry_date: item.stock_entry_date ?? "",
    central_register: item.central_register ?? null,
    central_register_no: item.central_register_no ?? "",
    central_register_page_no: item.central_register_page_no ?? "",
    batch_number: item.batch_number ?? "",
    expiry_date: item.expiry_date ?? "",
  }));
}

function buildStageItemsPayload(items: InspectionItemRecord[], mode: StageItemsPayloadMode) {
  return items.map(item => {
    const payload: Record<string, unknown> = {
      ...(item.id ? { id: item.id } : {}),
      item: item.item || null,
      item_description: item.item_description,
      item_specifications: item.item_specifications || null,
      tendered_quantity: item.tendered_quantity,
      accepted_quantity: item.accepted_quantity,
      rejected_quantity: item.rejected_quantity,
      unit_price: item.unit_price,
      remarks: item.remarks || null,
      stock_register: item.stock_register || null,
      stock_register_no: item.stock_register_no || null,
      stock_register_page_no: item.stock_register_page_no || null,
      stock_entry_date: item.stock_entry_date || null,
    };

    if (mode === "central") {
      payload.central_register = item.central_register || null;
      payload.central_register_no = item.central_register_no || null;
      payload.central_register_page_no = item.central_register_page_no || null;
      payload.batch_number = item.batch_number || null;
      payload.expiry_date = item.expiry_date || null;
    }

    return payload;
  });
}

function parseQuantity(value: string) {
  const parsed = Number.parseInt(value || "0", 10);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
}

function getRegisterOptionLabel(register: InspectionStockRegisterOption) {
  return register.location_name
    ? `${register.register_number} - ${register.location_name}`
    : register.register_number;
}

function StageField({ label, hint, children, span }: { label: string; hint?: string; children: React.ReactNode; span?: number }) {
  return (
    <div className="field" style={span ? { gridColumn: `span ${span}` } : undefined}>
      <div className="field-label">{label}</div>
      {children}
      {hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}

function StageFormSection({ n, title, sub, children }: { n: number; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="form-section">
      <header className="form-section-head">
        <div className="form-section-n mono">{String(n).padStart(2, "0")}</div>
        <div>
          <h3>{title}</h3>
          {sub ? <div className="form-section-sub">{sub}</div> : null}
        </div>
      </header>
      <div className="form-section-body">{children}</div>
    </section>
  );
}

function StageActionModalFrame({
  eyebrow,
  title,
  onClose,
  children,
  footerMeta,
  footerActions,
  maxWidth = 820,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footerMeta: React.ReactNode;
  footerActions: React.ReactNode;
  maxWidth?: number;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal inspection-modal" role="dialog" aria-modal="true" style={{ maxWidth }}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">{eyebrow}</div>
            <h2>{title}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <InspectionIcon d="M18 6L6 18M6 6l12 12" size={14} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <footer className="modal-foot">
          <div className="modal-foot-meta mono">{footerMeta}</div>
          <div className="modal-foot-actions">{footerActions}</div>
        </footer>
      </div>
    </div>
  );
}

type StageModalProps = {
  open: boolean;
  inspection: InspectionRecord | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

function StockDetailsModal({ open, inspection, onClose, onSaved }: StageModalProps) {
  const [items, setItems] = useState<InspectionItemRecord[]>([]);
  const [stockRegisters, setStockRegisters] = useState<InspectionStockRegisterOption[]>([]);
  const [refsLoading, setRefsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !inspection) return;
    setItems(normalizeStageItems(inspection.items));
    setSubmitError(null);
    setSubmitting(false);
  }, [inspection, open]);

  useEffect(() => {
    if (!open) return;
    let ignored = false;
    setRefsLoading(true);
    apiFetch<Page<InspectionStockRegisterOption> | InspectionStockRegisterOption[]>("/api/inventory/stock-registers/?page_size=500")
      .then(data => {
        if (!ignored) setStockRegisters(normalizeApiList(data));
      })
      .catch(err => {
        if (!ignored) setSubmitError(err instanceof Error ? err.message : "Failed to load stock registers");
      })
      .finally(() => {
        if (!ignored) setRefsLoading(false);
      });
    return () => {
      ignored = true;
    };
  }, [open]);

  if (!open || !inspection) return null;

  const updateItem = (idx: number, patch: Partial<InspectionItemRecord>) => {
    setItems(prev => prev.map((item, index) => (index === idx ? { ...item, ...patch } : item)));
  };

  const submit = async () => {
    const invalidIndex = items.findIndex(item => Number(item.accepted_quantity || 0) + Number(item.rejected_quantity || 0) > Number(item.tendered_quantity || 0));
    if (invalidIndex >= 0) {
      setSubmitError(`Line ${invalidIndex + 1}: accepted and rejected quantities cannot exceed tendered quantity.`);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiFetch(`/api/inventory/inspections/${inspection.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ items: buildStageItemsPayload(items, "stock") }),
      });
      await apiFetch(`/api/inventory/inspections/${inspection.id}/submit_to_central_register/`, { method: "POST" });
      await onSaved();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save stock details");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StageActionModalFrame
      eyebrow="Stock Details"
      title={`${inspection.contract_no} - Department Register`}
      onClose={onClose}
      footerMeta={submitError ? <span className="foot-err">{submitError}</span> : <span className="foot-ok">Patch stock details, then advance to central register</span>}
      footerActions={(
        <>
          <button type="button" className="btn btn-md" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="button" className="btn btn-md btn-primary" onClick={submit} disabled={submitting || refsLoading}>
            {submitting ? "Submitting..." : "Submit to Central Register"}
          </button>
        </>
      )}
      maxWidth={940}
    >
      <StageFormSection n={1} title="Department stock details" sub="Record accepted/rejected quantities and department stock register coordinates for each line item.">
        {submitError ? (
          <div style={{ padding: "10px 14px", background: "var(--danger-weak)", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--danger)", fontSize: 13 }}>
            {submitError}
          </div>
        ) : null}
        <div className="inspection-items-table-wrap">
          <table className="inspection-items-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th>Item</th>
                <th style={{ width: 78 }}>Tendered</th>
                <th style={{ width: 84 }}>Accepted</th>
                <th style={{ width: 84 }}>Rejected</th>
                <th>Stock Register</th>
                <th style={{ width: 110 }}>Page</th>
                <th style={{ width: 150 }}>Entry Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id ?? `stock-${index}`}>
                  <td className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>{index + 1}</td>
                  <td>
                    <strong>{item.item_description || item.item_name || "Unnamed item"}</strong>
                    <div className="mono-small muted">{item.item_specifications || item.item_code || "No specifications recorded"}</div>
                  </td>
                  <td className="mono">{item.tendered_quantity}</td>
                  <td>
                    <input type="number" min={0} value={item.accepted_quantity} onChange={event => updateItem(index, { accepted_quantity: parseQuantity(event.target.value) })} />
                  </td>
                  <td>
                    <input type="number" min={0} value={item.rejected_quantity} onChange={event => updateItem(index, { rejected_quantity: parseQuantity(event.target.value) })} />
                  </td>
                  <td>
                    <select
                      value={item.stock_register ?? ""}
                      onChange={event => {
                        const selectedId = event.target.value ? Number(event.target.value) : null;
                        const register = stockRegisters.find(option => option.id === selectedId);
                        updateItem(index, { stock_register: selectedId, stock_register_no: register?.register_number ?? "" });
                      }}
                      disabled={refsLoading}
                    >
                      <option value="">Select register...</option>
                      {stockRegisters.map(register => (
                        <option key={register.id} value={register.id}>{getRegisterOptionLabel(register)}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input value={item.stock_register_page_no} onChange={event => updateItem(index, { stock_register_page_no: event.target.value })} placeholder="Page #" />
                  </td>
                  <td>
                    <input type="date" value={item.stock_entry_date} onChange={event => updateItem(index, { stock_entry_date: event.target.value })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StageFormSection>
    </StageActionModalFrame>
  );
}

function CentralRegisterModal({ open, inspection, onClose, onSaved }: StageModalProps) {
  const [items, setItems] = useState<InspectionItemRecord[]>([]);
  const [stockRegisters, setStockRegisters] = useState<InspectionStockRegisterOption[]>([]);
  const [itemOptions, setItemOptions] = useState<InspectionItemOption[]>([]);
  const [refsLoading, setRefsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !inspection) return;
    setItems(normalizeStageItems(inspection.items));
    setSubmitError(null);
    setSubmitting(false);
  }, [inspection, open]);

  useEffect(() => {
    if (!open) return;
    let ignored = false;
    setRefsLoading(true);
    Promise.all([
      apiFetch<Page<InspectionStockRegisterOption> | InspectionStockRegisterOption[]>("/api/inventory/stock-registers/?page_size=500").then(normalizeApiList),
      apiFetch<Page<InspectionItemOption> | InspectionItemOption[]>("/api/inventory/items/?page_size=500").then(normalizeApiList),
    ])
      .then(([loadedRegisters, loadedItems]) => {
        if (ignored) return;
        setStockRegisters(loadedRegisters);
        setItemOptions(loadedItems);
      })
      .catch(err => {
        if (!ignored) setSubmitError(err instanceof Error ? err.message : "Failed to load register references");
      })
      .finally(() => {
        if (!ignored) setRefsLoading(false);
      });
    return () => {
      ignored = true;
    };
  }, [open]);

  if (!open || !inspection) return null;

  const updateItem = (idx: number, patch: Partial<InspectionItemRecord>) => {
    setItems(prev => prev.map((item, index) => (index === idx ? { ...item, ...patch } : item)));
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiFetch(`/api/inventory/inspections/${inspection.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ items: buildStageItemsPayload(items, "central") }),
      });
      await apiFetch(`/api/inventory/inspections/${inspection.id}/submit_to_finance_review/`, { method: "POST" });
      await onSaved();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save central register details");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StageActionModalFrame
      eyebrow="Central Register"
      title={`${inspection.contract_no} - Central Store Mapping`}
      onClose={onClose}
      footerMeta={submitError ? <span className="foot-err">{submitError}</span> : <span className="foot-ok">Patch central register details, then send to finance review</span>}
      footerActions={(
        <>
          <button type="button" className="btn btn-md" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="button" className="btn btn-md btn-primary" onClick={submit} disabled={submitting || refsLoading}>
            {submitting ? "Submitting..." : "Submit to Finance Review"}
          </button>
        </>
      )}
      maxWidth={1040}
    >
      <StageFormSection n={1} title="Central register details" sub="Link accepted lines to catalog items and record central register coordinates before finance review.">
        {submitError ? (
          <div style={{ padding: "10px 14px", background: "var(--danger-weak)", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--danger)", fontSize: 13 }}>
            {submitError}
          </div>
        ) : null}
        <div className="inspection-items-table-wrap">
          <table className="inspection-items-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th>Item</th>
                <th style={{ width: 90 }}>Accepted</th>
                <th>Stock Context</th>
                <th>System Item</th>
                <th>Central Register</th>
                <th style={{ width: 100 }}>Page</th>
                <th style={{ width: 130 }}>Batch</th>
                <th style={{ width: 150 }}>Expiry</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id ?? `central-${index}`}>
                  <td className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>{index + 1}</td>
                  <td>
                    <strong>{item.item_description || item.item_name || "Unnamed item"}</strong>
                    <div className="mono-small muted">{item.item_specifications || item.item_code || "No specifications recorded"}</div>
                  </td>
                  <td className="mono">{item.accepted_quantity}</td>
                  <td>
                    <span className="coord">{getRegisterRef(item.stock_register_name, item.stock_register_no, item.stock_register_page_no)}</span>
                    <div className="mono-small muted">Entry {formatInspectionDate(item.stock_entry_date)}</div>
                  </td>
                  <td>
                    <select value={item.item ?? ""} onChange={event => updateItem(index, { item: event.target.value ? Number(event.target.value) : null })} disabled={refsLoading}>
                      <option value="">Select system item...</option>
                      {itemOptions.map(option => (
                        <option key={option.id} value={option.id}>{option.code} - {option.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={item.central_register ?? ""}
                      onChange={event => {
                        const selectedId = event.target.value ? Number(event.target.value) : null;
                        const register = stockRegisters.find(option => option.id === selectedId);
                        updateItem(index, { central_register: selectedId, central_register_no: register?.register_number ?? "" });
                      }}
                      disabled={refsLoading}
                    >
                      <option value="">Select register...</option>
                      {stockRegisters.map(register => (
                        <option key={register.id} value={register.id}>{getRegisterOptionLabel(register)}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input value={item.central_register_page_no} onChange={event => updateItem(index, { central_register_page_no: event.target.value })} placeholder="Page #" />
                  </td>
                  <td>
                    <input value={item.batch_number} onChange={event => updateItem(index, { batch_number: event.target.value })} placeholder="Batch #" />
                  </td>
                  <td>
                    <input type="date" value={item.expiry_date} onChange={event => updateItem(index, { expiry_date: event.target.value })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StageFormSection>
    </StageActionModalFrame>
  );
}

function FinanceDateModal({ open, inspection, onClose, onSaved }: StageModalProps) {
  const [financeCheckDate, setFinanceCheckDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !inspection) return;
    setFinanceCheckDate(inspection.finance_check_date ?? new Date().toISOString().slice(0, 10));
    setSubmitError(null);
    setSubmitting(false);
  }, [inspection, open]);

  if (!open || !inspection) return null;

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiFetch(`/api/inventory/inspections/${inspection.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          finance_check_date: financeCheckDate || null,
          items: buildStageItemsPayload(normalizeStageItems(inspection.items), "central"),
        }),
      });
      await apiFetch(`/api/inventory/inspections/${inspection.id}/complete/`, { method: "POST" });
      await onSaved();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to complete finance review");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StageActionModalFrame
      eyebrow="Finance Review"
      title={`${inspection.contract_no} - Finance Check Date`}
      onClose={onClose}
      footerMeta={submitError ? <span className="foot-err">{submitError}</span> : <span className="foot-ok">Patch finance date, then complete certificate</span>}
      footerActions={(
        <>
          <button type="button" className="btn btn-md" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="button" className="btn btn-md btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? "Completing..." : "Complete Certificate"}
          </button>
        </>
      )}
      maxWidth={460}
    >
      <StageFormSection n={1} title="Finance confirmation" sub="Record the finance check date before final approval.">
        {submitError ? (
          <div style={{ padding: "10px 14px", background: "var(--danger-weak)", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--danger)", fontSize: 13 }}>
            {submitError}
          </div>
        ) : null}
        <div className="form-grid-2">
          <StageField label="Finance Check Date" span={2}>
            <input type="date" value={financeCheckDate} onChange={event => setFinanceCheckDate(event.target.value)} />
          </StageField>
        </div>
      </StageFormSection>
    </StageActionModalFrame>
  );
}

function StageStatusPill({ inspection }: { inspection: InspectionRecord }) {
  return (
    <span className={`pill ${getStagePillClass(inspection.stage)} pill-lg`}>
      <span className="status-dot active" />
      {getStagePillLabel(inspection)}
    </span>
  );
}

function StatStrip({ inspection }: { inspection: InspectionRecord }) {
  const totals = getInspectionTotals(inspection);
  const acceptedPct = totals.tendered > 0 ? `${((totals.accepted / totals.tendered) * 100).toFixed(1)}% acceptance` : "No tendered quantity";
  return (
    <div className="stat-strip" style={{ marginBottom: 16 }}>
      <div className="stat stat-accent">
        <div className="stat-label">Items inspected</div>
        <div className="stat-value">{totals.lines}</div>
        <div className="stat-sub">line items on certificate</div>
      </div>
      <div className="stat">
        <div className="stat-label">Tendered qty</div>
        <div className="stat-value">{totals.tendered}</div>
        <div className="stat-sub">units presented</div>
      </div>
      <div className="stat">
        <div className="stat-label">Accepted</div>
        <div className="stat-value" style={{ color: "var(--success)" }}>{totals.accepted}</div>
        <div className="stat-sub">{acceptedPct}</div>
      </div>
      <div className="stat">
        <div className="stat-label">Rejected</div>
        <div className="stat-value" style={{ color: "var(--danger)" }}>{totals.rejected}</div>
        <div className="stat-sub">returned or pending correction</div>
      </div>
    </div>
  );
}

function CertificateInfoCard({ inspection }: { inspection: InspectionRecord }) {
  const values = getInspectionValueTotals(inspection);
  return (
    <div className="card">
      <div className="card-head"><h3>Certificate information</h3></div>
      <div className="card-body">
        <div className="kv-grid">
          <KeyValue label="Certificate no." value={<span className="mono">{inspection.contract_no}</span>} />
          <KeyValue label="Inspection type" value="Acceptance inspection" />
          <KeyValue label="Linked PO" value={<span className="mono">{inspection.contract_no}</span>} />
          <KeyValue label="Fiscal year" value={getFiscalYear(inspection.date || inspection.created_at)} />
          <KeyValue label="Vendor" value={inspection.contractor_name || "Not recorded"} sub={inspection.contractor_address || undefined} />
          <KeyValue label="Delivery received on" value={formatInspectionDateTime(inspection.date_of_delivery)} />
          <KeyValue label="Receiving department" value={inspection.department_name || "Not recorded"} sub={inspection.indenter || undefined} />
          <KeyValue label="Total certified value" value={<span className="mono">PKR {formatCurrency(values.accepted)}</span>} sub="subject to finance reconciliation" />
          <KeyValue label="Dept. register" value={<span className="coord">{getFirstRegisterRef(inspection, "stock")}</span>} />
          <KeyValue label="Central register" value={<span className="coord">{getFirstRegisterRef(inspection, "central")}</span>} />
          <KeyValue label="Inspection committee" value={inspection.inspected_by || "Not recorded"} sub={inspection.consignee_designation || undefined} />
          <KeyValue label="Target close date" value={formatInspectionDate(inspection.finance_check_date || inspection.updated_at)} />
        </div>
      </div>
    </div>
  );
}

function ItemStatusPill({ item }: { item: InspectionItemRecord }) {
  if (item.rejected_quantity > 0) {
    return <span className="pill pill-warn"><span className="status-dot" style={{ background: "var(--warn)" }} />Partly accepted</span>;
  }
  if (item.accepted_quantity > 0) {
    return <span className="pill pill-success"><span className="status-dot active" />Accepted</span>;
  }
  return <span className="pill pill-draft"><span className="status-dot" />Pending review</span>;
}

function InspectionItemCard({ item, index, inspection }: { item: InspectionItemRecord; index: number; inspection: InspectionRecord }) {
  const unitPrice = getLineUnitPrice(item.unit_price);
  const acceptedValue = unitPrice * Number(item.accepted_quantity || 0);
  const itemCode = item.item_code || `ITEM-${String(index + 1).padStart(3, "0")}`;
  const registerRows = [
    item.stock_register_name || item.stock_register_no
      ? { label: "Stage 1", value: getRegisterRef(item.stock_register_name, item.stock_register_no, item.stock_register_page_no) }
      : null,
    item.central_register_name || item.central_register_no
      ? { label: "Stage 2", value: getRegisterRef(item.central_register_name, item.central_register_no, item.central_register_page_no) }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <div className="ins-item">
      <div className="ins-item-head">
        <div className="ins-item-head-left">
          <div className="ins-item-idx">{String(index + 1).padStart(2, "0")}</div>
          <div>
            <div className="ins-item-title">{item.item_description || item.item_name || "Unnamed item"}</div>
            <div className="ins-item-cat">{item.item_name || "Catalog item"} <span className="crumb">›</span> {itemCode}</div>
          </div>
        </div>
        <div><ItemStatusPill item={item} /></div>
      </div>
      <div className="ins-item-body">
        <KeyValue label="Make / Model" value={item.item_name || item.item_description || "Not recorded"} />
        <KeyValue label="Specifications" value={<span className="mono" style={{ fontSize: 11.5 }}>{item.item_specifications || itemCode}</span>} />
        <KeyValue label="Unit rate" value={<span className="mono">PKR {formatCurrency(unitPrice)}</span>} />
        <KeyValue label="Line total" value={<span className="mono"><strong>{acceptedValue > 0 ? `PKR ${formatCurrency(acceptedValue)}` : "Not certified"}</strong></span>} />
        <div className="kv" style={{ gridColumn: "span 2" }}>
          <div className="kv-label">Quantity breakdown</div>
          <div className="qty-grid">
            <div className="qty"><div className="qty-label">Tendered</div><div className="qty-value">{item.tendered_quantity}</div></div>
            <div className="qty accept"><div className="qty-label">Accepted</div><div className="qty-value">{item.accepted_quantity}</div></div>
            <div className="qty reject"><div className="qty-label">Rejected</div><div className="qty-value">{item.rejected_quantity}</div></div>
          </div>
        </div>
        <div className="kv" style={{ gridColumn: "span 2" }}>
          <div className="kv-label">{item.rejected_quantity > 0 ? "Rejection reason" : "Register coordinates"}</div>
          <div className="kv-value" style={{ fontWeight: 400, fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
            {item.rejected_quantity > 0 && item.remarks ? item.remarks : (
              registerRows.length > 0 ? registerRows.map(row => (
                <div className="row-flex" style={{ gap: 6, marginTop: 6 }} key={`${item.id}-${row.label}`}>
                  <span className="mono-small muted">{row.label}</span>
                  <span className="coord">{row.value}</span>
                </div>
              )) : "Register coordinates not recorded yet."
            )}
          </div>
        </div>
      </div>
      <div className="ins-item-foot">
        <span>{item.remarks || `Verified under ${INSPECTION_STAGE_LABELS[inspection.stage].toLowerCase()}`}</span>
        <span className="mono-small">last update {formatInspectionDateShort(inspection.updated_at)}</span>
      </div>
    </div>
  );
}

function ItemsInspected({ inspection }: { inspection: InspectionRecord }) {
  return (
    <div>
      <div className="section-h">
        <span className="eyebrow">Items inspected</span>
        <span className="section-h-meta">{inspection.items.length} line items - expand to see per-stage register entries</span>
      </div>
      {inspection.items.length > 0 ? inspection.items.map((item, index) => (
        <InspectionItemCard key={item.id ?? `${item.item_description}-${index}`} item={item} index={index} inspection={inspection} />
      )) : <div className="card card-pad muted">No line items on this certificate yet.</div>}
    </div>
  );
}

function SupportingDocuments({ inspection }: { inspection: InspectionRecord }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>Supporting documents</h3>
      </div>
      <div className="docs-list">
        {inspection.documents.length > 0 ? inspection.documents.map(document => (
          <a className="doc-row" key={document.id} href={getDocumentHref(document.file)} target="_blank" rel="noopener noreferrer">
            <div className={`doc-icon ${getDocumentIconClass(document.file, document.label)}`}>{getDocumentBadge(document.file, document.label)}</div>
            <div className="doc-meta">
              <div className="doc-name">{document.label || document.file.split("/").pop() || "Document"}</div>
              <div className="doc-sub"><span className="mono">{getDocumentBadge(document.file, document.label)}</span><span className="dot-sep">·</span><span>uploaded {formatInspectionDateShort(document.uploaded_at)}</span></div>
            </div>
            <span className="btn btn-xs btn-ghost icon-only" title="Download"><InspectionIcon d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" size={13} /></span>
          </a>
        )) : <div className="doc-row"><div className="doc-meta"><div className="doc-name muted">No supporting documents are attached.</div></div></div>}
      </div>
    </div>
  );
}

function SignOffChain({ inspection }: { inspection: InspectionRecord }) {
  const steps = visibleWorkflowSteps(inspection).slice(0, 3);
  return (
    <div>
      <div className="section-h">
        <span className="eyebrow">Sign-off chain</span>
        <span className="section-h-meta">{steps.filter(step => step.state === "complete").length} of {steps.length} captured</span>
      </div>
      <div className="signoff">
        {steps.map((step, index) => (
          <div className={`so ${step.state === "upcoming" || step.state === "current" ? "pending" : ""}`} key={step.key}>
            <div className="so-role">Stage {index + 1} - {step.label}</div>
            <div className="so-name">{step.ownerLabel || "Awaiting officer"}</div>
            <div className="so-sig">{step.state === "complete" ? step.ownerLabel?.split(" ").map(part => part[0]).join(". ") || "Signed" : step.state === "current" ? "In progress" : "Awaiting"}</div>
            <div className="so-when">{step.activityAt ? formatInspectionDateTime(step.activityAt) : "target pending"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StageActionsCard({
  inspection,
  editLabel,
  canEdit,
  canReject,
  busyAction,
  primaryAction,
  onEdit,
  onReject,
}: {
  inspection: InspectionRecord;
  editLabel: string | null;
  canEdit: boolean;
  canReject: boolean;
  busyAction: string | null;
  primaryAction: { label: string; onClick: () => void } | null;
  onEdit: () => void;
  onReject: () => void;
}) {
  return (
    <div className="card">
      <div className="card-head"><h3>{INSPECTION_STAGE_LABELS[inspection.stage]} actions</h3></div>
      <div className="card-body card-body-tight">
        <div className="kv" style={{ marginBottom: 12 }}>
          <div className="kv-label">Your role</div>
          <div className="kv-value">Inspection workflow officer</div>
          <div className="kv-sub">Available actions are limited to backend-supported permissions.</div>
        </div>
        <div className="kv" style={{ marginBottom: 12 }}>
          <div className="kv-label">Items pending your review</div>
          <div className="kv-value"><strong>{inspection.items.filter(item => item.accepted_quantity === 0 && item.rejected_quantity === 0).length}</strong> of {inspection.items.length} items</div>
        </div>
        <hr className="h-rule" />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {primaryAction ? (
            <button type="button" className="btn btn-primary btn-sm" style={{ justifyContent: "flex-start" }} onClick={primaryAction.onClick} disabled={busyAction !== null}>
              <InspectionIcon d="M20 6L9 17l-5-5" size={14} />
              {primaryAction.label}
            </button>
          ) : null}
          {canEdit && editLabel ? (
            <button type="button" className="btn btn-sm" style={{ justifyContent: "flex-start" }} onClick={onEdit} disabled={busyAction !== null}>
              <InspectionIcon d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" size={14} />
              {editLabel}
            </button>
          ) : null}
          {canReject ? (
            <button type="button" className="btn btn-sm btn-danger-ghost" style={{ justifyContent: "flex-start" }} onClick={onReject} disabled={busyAction !== null}>
              <InspectionIcon d={<><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></>} size={14} />
              Reject delivery
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StageSummaryCard({ inspection }: { inspection: InspectionRecord }) {
  const totals = getInspectionTotals(inspection);
  const values = getInspectionValueTotals(inspection);
  return (
    <div className="card">
      <div className="card-head"><h3>{INSPECTION_STAGE_LABELS[inspection.stage]} summary</h3></div>
      <div className="card-body card-body-tight" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <KeyValue label="Items reviewed" value={<><strong>{totals.accepted + totals.rejected}</strong> of {totals.lines}</>} />
        <KeyValue label="Accepted value" value={<span className="mono">PKR {formatCurrency(values.accepted)}</span>} />
        <KeyValue label="Rejected value" value={<span className="mono" style={{ color: "var(--danger)" }}>PKR {formatCurrency(values.rejected)}</span>} />
        <KeyValue label="Provisional / pending" value={<span className="mono">PKR {formatCurrency(Math.max(values.tendered - values.accepted - values.rejected, 0))}</span>} />
      </div>
    </div>
  );
}

function LinkedRecords({ inspection }: { inspection: InspectionRecord }) {
  return (
    <div className="card">
      <div className="card-head"><h3>Linked records</h3></div>
      <div className="ref-list">
        <div className="ref-row">
          <div className="ref-text"><div className="ref-doc">{inspection.contract_no}</div><div className="ref-sub">Purchase order / contract - {inspection.department_name || "department not recorded"}</div></div>
          <span className="ref-arrow"><InspectionIcon d="M9 18l6-6-6-6" size={14} /></span>
        </div>
        {inspection.stock_entries.map(entry => (
          <Link className="ref-row" href={`/stock-entries/${entry.id}`} key={entry.id}>
            <div className="ref-text"><div className="ref-doc">{entry.entry_number}</div><div className="ref-sub">{formatStockEntryTypeLabel(entry.entry_type)} - {formatStockEntryTypeLabel(entry.status)}</div></div>
            <span className="ref-arrow"><InspectionIcon d="M9 18l6-6-6-6" size={14} /></span>
          </Link>
        ))}
        <div className="ref-row">
          <div className="ref-text"><div className="ref-doc">{getFirstRegisterRef(inspection, "stock")}</div><div className="ref-sub">Stage 1 register - department stock</div></div>
          <span className="ref-arrow"><InspectionIcon d="M9 18l6-6-6-6" size={14} /></span>
        </div>
        <div className="ref-row">
          <div className="ref-text"><div className="ref-doc">{getFirstRegisterRef(inspection, "central")}</div><div className="ref-sub">Stage 2 register - central inspection</div></div>
          <span className="ref-arrow"><InspectionIcon d="M9 18l6-6-6-6" size={14} /></span>
        </div>
      </div>
    </div>
  );
}

function WorkflowHistory({ inspection }: { inspection: InspectionRecord }) {
  const steps = getInspectionWorkflowSteps(inspection);
  return (
    <div className="card">
      <div className="card-head">
        <h3>Workflow history</h3>
        <div className="head-meta">{steps.length} events</div>
      </div>
      <div className="timeline">
        {steps.map(step => (
          <div className="tl-item" key={step.key}>
            <div className={`tl-dot ${step.state === "complete" ? "ok" : step.state === "current" ? "info" : step.state === "rejected" ? "danger" : "warn"}`} />
            <div className="tl-content">
              <div className="tl-title"><span className="who">{step.ownerLabel || "System"}</span> - {step.label}</div>
              <div className="tl-meta"><span>{step.state}</span><span className="dot-sep">·</span><span className="when">{step.activityAt ? formatInspectionDateShort(step.activityAt) : "pending"}</span></div>
              <div className="tl-note">{step.state === "current" ? "This workflow stage is currently active." : step.state === "complete" ? "This workflow stage has been completed." : step.state === "rejected" ? inspection.rejection_reason || "Rejected at this stage." : "This workflow stage is awaiting the previous approval."}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function InspectionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { can, hasInspectionStage, isLoading: capsLoading } = useCapabilities();

  const canView = can("inspections", "view");
  const canManage = can("inspections", "manage");
  const canFull = can("inspections", "full");

  const [inspection, setInspection] = useState<InspectionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [centralModalOpen, setCentralModalOpen] = useState(false);
  const [financeModalOpen, setFinanceModalOpen] = useState(false);

  const loadInspection = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<InspectionRecord>(`/api/inventory/inspections/${params.id}/`);
      setInspection(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inspection certificate");
      return null;
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (capsLoading) return;
    if (!canView) {
      router.replace("/403");
      return;
    }
    loadInspection();
  }, [canView, capsLoading, loadInspection, router]);

  const editLabel = inspection ? getInspectionStageEditorLabel(inspection.stage) : null;
  const canEdit = inspection ? canResumeInspectionEditor(inspection, canManage, hasInspectionStage) : false;
  const canReject = Boolean(inspection && canManage && !["COMPLETED", "REJECTED", "DRAFT"].includes(inspection.stage));
  const canDelete = Boolean(inspection && canFull && inspection.stage === "DRAFT");

  const canActStage1 = Boolean(inspection && inspection.stage === "DRAFT" && hasInspectionStage("initiate_inspection"));
  const canActStage2 = Boolean(inspection && inspection.stage === "STOCK_DETAILS" && hasInspectionStage("fill_stock_details"));
  const canActStage3 = Boolean(inspection && inspection.stage === "CENTRAL_REGISTER" && hasInspectionStage("fill_central_register"));
  const canActStage4 = Boolean(inspection && inspection.stage === "FINANCE_REVIEW" && hasInspectionStage("review_finance"));

  const handleInitiate = useCallback(async () => {
    if (!inspection) return;
    setBusyAction("initiate");
    setError(null);
    try {
      await apiFetch(`/api/inventory/inspections/${inspection.id}/initiate/`, { method: "POST" });
      await loadInspection();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to initiate certificate");
    } finally {
      setBusyAction(null);
    }
  }, [inspection, loadInspection]);

  const handleSubmitStockDetails = useCallback(async () => {
    setStockModalOpen(true);
  }, []);

  const handleSubmitCentralRegister = useCallback(async () => {
    setCentralModalOpen(true);
  }, []);

  const handleCompleteFinance = useCallback(async () => {
    setFinanceModalOpen(true);
  }, []);

  const handleOpenStageEditor = useCallback(() => {
    if (!inspection) return;
    if (inspection.stage === "DRAFT") {
      setEditOpen(true);
    } else if (inspection.stage === "STOCK_DETAILS") {
      setStockModalOpen(true);
    } else if (inspection.stage === "CENTRAL_REGISTER") {
      setCentralModalOpen(true);
    } else if (inspection.stage === "FINANCE_REVIEW") {
      setFinanceModalOpen(true);
    }
  }, [inspection]);

  const handleRejectConfirm = useCallback(async (reason: string) => {
    if (!inspection) return;
    setBusyAction("reject");
    setError(null);
    try {
      await apiFetch(`/api/inventory/inspections/${inspection.id}/reject/`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setRejectOpen(false);
      await loadInspection();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Reject failed");
    } finally {
      setBusyAction(null);
    }
  }, [inspection, loadInspection]);

  const handleDelete = useCallback(async () => {
    if (!inspection) return;
    const confirmed = window.confirm(`Delete inspection ${inspection.contract_no}? This cannot be undone.`);
    if (!confirmed) return;
    setBusyAction("delete");
    setError(null);
    try {
      await apiFetch(`/api/inventory/inspections/${inspection.id}/`, { method: "DELETE" });
      router.push("/inspections");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setBusyAction(null);
    }
  }, [inspection, router]);

  const openPdf = useCallback(() => {
    if (!inspection) return;
    window.open(`${API_BASE}/api/inventory/inspections/${inspection.id}/view_pdf/`, "_blank");
  }, [inspection]);

  const primaryAction = useMemo(() => getStageAction(
    inspection,
    { canActStage1, canActStage2, canActStage3, canActStage4 },
    { handleInitiate, handleSubmitStockDetails, handleSubmitCentralRegister, handleCompleteFinance },
  ), [
    inspection,
    canActStage1,
    canActStage2,
    canActStage3,
    canActStage4,
    handleInitiate,
    handleSubmitStockDetails,
    handleSubmitCentralRegister,
    handleCompleteFinance,
  ]);

  return (
    <div>
      {inspection?.stage === "DRAFT" ? (
        <InspectionModal
          open={editOpen}
          mode="edit"
          inspection={inspection}
          hasStage={hasInspectionStage}
          onClose={() => setEditOpen(false)}
          onSave={async () => { await loadInspection(); }}
        />
      ) : null}
      <StockDetailsModal open={stockModalOpen} inspection={inspection} onClose={() => setStockModalOpen(false)} onSaved={async () => { await loadInspection(); }} />
      <CentralRegisterModal open={centralModalOpen} inspection={inspection} onClose={() => setCentralModalOpen(false)} onSaved={async () => { await loadInspection(); }} />
      <FinanceDateModal open={financeModalOpen} inspection={inspection} onClose={() => setFinanceModalOpen(false)} onSaved={async () => { await loadInspection(); }} />
      <RejectInspectionModal open={rejectOpen} onClose={() => setRejectOpen(false)} onConfirm={handleRejectConfirm} />
      <Topbar breadcrumb={["Operations", "Inspection Certificates", inspection?.contract_no ?? "Detail"]} />

      <div className="page" id="page-ins" data-density="balanced">
        <Link className="page-back" href="/inspections" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)", textDecoration: "none", marginBottom: 8 }}>
          <InspectionIcon d="M19 12H5M12 19l-7-7 7-7" size={12} />
          Back to Inspections
        </Link>

        {error ? <Alert>{error}</Alert> : null}

        {loading ? (
          <div className="card card-pad muted">Loading inspection certificate...</div>
        ) : inspection ? (
          <>
            <div className="page-head-detail">
              <div className="page-title-group">
                <div className="eyebrow">Inspection Certificate - Acceptance</div>
                <h1 className="display">{getDisplayTitle(inspection)}</h1>
                <div className="page-sub">{getDisplaySubtitle(inspection)}</div>
                <div className="page-id-row">
                  <span className="doc-no">{inspection.contract_no}</span>
                  <StageStatusPill inspection={inspection} />
                  <span className="doc-meta">
                    <span className="dot-sep">·</span>
                    <span>Opened <strong>{formatInspectionDateTime(inspection.created_at)}</strong></span>
                    <span className="dot-sep">·</span>
                    <span>Register <span className="mono-small">{getFirstRegisterRef(inspection, "central")}</span></span>
                  </span>
                </div>
              </div>

              <div className="page-head-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.print()}>
                  <InspectionIcon d={<><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><path d="M6 14h12v8H6z" /></>} size={14} />
                  Print certificate
                </button>
                <button type="button" className="btn btn-sm" onClick={openPdf}>
                  <InspectionIcon d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" size={14} />
                  Export PDF
                </button>
                {canReject ? (
                  <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => setRejectOpen(true)} disabled={busyAction !== null}>
                    <InspectionIcon d={<><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></>} size={14} />
                    Reject & return
                  </button>
                ) : null}
                {primaryAction ? (
                  <button type="button" className="btn btn-primary btn-sm" onClick={primaryAction.onClick} disabled={busyAction !== null}>
                    <InspectionIcon d="M20 6L9 17l-5-5" size={14} />
                    {primaryAction.label}
                  </button>
                ) : null}
                {canDelete ? (
                  <button type="button" className="btn btn-sm btn-danger-ghost" onClick={handleDelete} disabled={busyAction !== null}>
                    <InspectionIcon d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0l1 12h6l1-12" size={14} />
                    Delete draft
                  </button>
                ) : null}
              </div>
            </div>

            <WorkflowTracker inspection={inspection} />
            <div style={{ height: 16 }} />
            <StatStrip inspection={inspection} />

            {inspection.stage === "REJECTED" ? (
              <div className="notice notice-danger">
                <div className="notice-body">
                  <div className="notice-title">Workflow rejected</div>
                  <div className="notice-text">{inspection.rejection_reason || "This certificate was rejected."}</div>
                </div>
              </div>
            ) : null}

            <div className="detail-grid">
              <div className="detail-main">
                <CertificateInfoCard inspection={inspection} />
                <ItemsInspected inspection={inspection} />
                <SupportingDocuments inspection={inspection} />
                <SignOffChain inspection={inspection} />
              </div>

              <div className="detail-aside">
                <StageActionsCard
                  inspection={inspection}
                  editLabel={editLabel}
                  canEdit={canEdit}
                  canReject={canReject}
                  busyAction={busyAction}
                  primaryAction={primaryAction}
                  onEdit={handleOpenStageEditor}
                  onReject={() => setRejectOpen(true)}
                />
                <StageSummaryCard inspection={inspection} />
                <LinkedRecords inspection={inspection} />
                <WorkflowHistory inspection={inspection} />
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
