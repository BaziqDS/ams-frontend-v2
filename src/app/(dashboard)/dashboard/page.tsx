import { Topbar } from "@/components/Topbar";

export default function DashboardPage() {
  return (
    <div>
      <Topbar breadcrumb={["Overview", "Dashboard"]} />
      <div className="page">
        <div className="page-head">
          <div className="page-title-group">
            <div className="eyebrow">Overview</div>
            <h1>Dashboard</h1>
            <div className="page-sub">To be implemented.</div>
          </div>
        </div>

        <div className="table-card" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Status</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>
            Dashboard placeholder
          </div>
          <div style={{ color: "var(--text-2)", fontSize: 14, maxWidth: 680 }}>
            This route is intentionally permission-free for authenticated users so it can act as the
            default landing page while the real dashboard is still under development.
          </div>
        </div>
      </div>
    </div>
  );
}
