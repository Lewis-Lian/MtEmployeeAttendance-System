import { FormEvent, useEffect, useState } from "react";

import {
  batchAdminDepartments,
  createAdminDepartment,
  deleteAdminDepartment,
  deleteUnboundAdminDepartments,
  fetchAdminDepartments,
  importAdminDepartments,
  updateAdminDepartment,
} from "../../api/admin";
import DepartmentPicker from "../../components/query/DepartmentPicker";
import QueryResultPanel from "../../components/query/QueryResultPanel";
import QueryTable from "../../components/query/QueryTable";
import type { AdminDepartment } from "../../types/admin";
import { useConfirm } from "../../components/feedback/ConfirmDialog";
import { useNotification } from "../../components/feedback/Notification";


type DepartmentFormState = {
  dept_no: string;
  dept_name: string;
  parent_id: string;
  is_locked: boolean;
};

const emptyDepartmentForm: DepartmentFormState = {
  dept_no: "",
  dept_name: "",
  parent_id: "",
  is_locked: false,
};

function departmentToForm(row: AdminDepartment): DepartmentFormState {
  return {
    dept_no: row.dept_no ?? "",
    dept_name: row.dept_name,
    parent_id: row.parent_id ? String(row.parent_id) : "",
    is_locked: Boolean(row.is_locked),
  };
}

export default function DepartmentsPage() {
  const confirm = useConfirm();
  const notification = useNotification();
  const [rows, setRows] = useState<AdminDepartment[]>([]);

  const [form, setForm] = useState<DepartmentFormState>(emptyDepartmentForm);
  const [editing, setEditing] = useState<AdminDepartment | null>(null);
  const [editForm, setEditForm] = useState<DepartmentFormState>(emptyDepartmentForm);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchAction, setBatchAction] = useState("");
  const [batchParentId, setBatchParentId] = useState("");
  const [batchParentModalOpen, setBatchParentModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importInputKey, setImportInputKey] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState<"create" | "import" | null>(null);

  const handleCloseModal = () => {
    setShowModal(null);
  };

  async function loadRows() {
    setLoading(true);
    try {
      const nextRows = await fetchAdminDepartments();
      setRows(nextRows);
      setSelectedIds((current) => current.filter((id) => nextRows.some((row) => row.id === id)));
    } catch (err) {
      notification.error(err instanceof Error ? err.message : "部门列表加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRows();
  }, []);

  function toggleSelected(id: number) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function payloadFromForm(value: DepartmentFormState) {
    return {
      dept_no: value.dept_no,
      dept_name: value.dept_name,
      parent_id: value.parent_id || null,
      is_locked: value.is_locked,
    };
  }

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    try {
      await createAdminDepartment(payloadFromForm(form));
      setForm(emptyDepartmentForm);
      notification.success("部门已创建");
      setShowModal(null);
      await loadRows();
    } catch (err) {
      notification.error(err instanceof Error ? err.message : "创建部门失败");
    }
  }

  async function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) {
      return;
    }
    try {
      await updateAdminDepartment(editing.id, payloadFromForm(editForm));
      setEditing(null);
      notification.success("部门已保存");
      await loadRows();
    } catch (err) {
      notification.error(err instanceof Error ? err.message : "保存部门失败");
    }
  }

  async function removeDepartment(row: AdminDepartment) {
    const isConfirmed = await confirm({
      message: `确定删除部门 ${row.dept_name}？`,
      type: "danger",
    });
    if (!isConfirmed) {
      return;
    }
    try {
      await deleteAdminDepartment(row.id);
      notification.success("部门已删除");
      await loadRows();
    } catch (err) {
      notification.error(err instanceof Error ? err.message : "删除部门失败");
    }
  }


  async function applyBatchAction() {
    if (!batchAction) {
      notification.warning("请选择批量操作");
      return;
    }
    if (selectedIds.length === 0) {
      notification.warning("请先选择部门");
      return;
    }
    if (batchAction === "set_parent") {
      setBatchParentId("");
      setBatchParentModalOpen(true);
      return;
    }
    try {
      await batchAdminDepartments({
        ids: selectedIds,
        action: batchAction,
      });
      setSelectedIds([]);
      setBatchAction("");
      setBatchParentId("");
      notification.success("批量操作已完成");
      await loadRows();
    } catch (err) {
      notification.error(err instanceof Error ? err.message : "批量操作失败");
    }
  }

  async function applyBatchParent() {
    if (selectedIds.length === 0) {
      notification.warning("请先选择部门");
      return;
    }
    try {
      await batchAdminDepartments({
        ids: selectedIds,
        action: "set_parent",
        parent_id: batchParentId || null,
      });
      setSelectedIds([]);
      setBatchAction("");
      setBatchParentId("");
      setBatchParentModalOpen(false);
      notification.success("批量操作已完成");
      await loadRows();
    } catch (err) {
      notification.error(err instanceof Error ? err.message : "批量操作失败");
    }
  }

  async function removeUnboundDepartments() {
    const isConfirmed = await confirm({
      message: "确定一键删除空部门？锁定、绑定员工或账号权限的部门会被跳过。",
      type: "danger",
    });
    if (!isConfirmed) {
      return;
    }
    try {
      const result = await deleteUnboundAdminDepartments();
      notification.success(`已删除 ${String(result.deleted ?? 0)} 个空部门`);
      await loadRows();
    } catch (err) {
      notification.error(err instanceof Error ? err.message : "删除空部门失败");
    }
  }


  function openEdit(row: AdminDepartment) {
    setEditing(row);
    setEditForm(departmentToForm(row));
  }

  async function submitImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!importFile?.name) {
      notification.warning("请选择要导入的 xlsx 文件");
      return;
    }
    if (!importFile.name.toLowerCase().endsWith(".xlsx")) {
      notification.warning("仅支持 .xlsx 文件");
      return;
    }

    setIsImporting(true);
    try {
      const result = await importAdminDepartments(importFile);
      form.reset();
      setImportFile(null);
      setImportInputKey((current) => current + 1);
      notification.success(`导入成功，处理 ${String(result.imported)} 条`);
      setShowModal(null);
      await loadRows();
    } catch (err) {
      notification.error(err instanceof Error ? err.message : "导入失败");
    } finally {
      setIsImporting(false);
    }
  }

  const departmentTableHeaders = [
    {
      label: (
        <input
          checked={selectedIds.length > 0 && selectedIds.length === rows.length}
          onChange={(event) => setSelectedIds(event.target.checked ? rows.map((row) => row.id) : [])}
          type="checkbox"
        />
      ),
      sortable: false,
    },
    "ID",
    "部门编号",
    "部门名称",
    "上级部门",
    "锁定",
    { label: "操作", sortable: false },
  ];
  const departmentTableRows = loading
    ? []
    : rows.map((row) => [
        <input checked={selectedIds.includes(row.id)} onChange={() => toggleSelected(row.id)} type="checkbox" />,
        row.id,
        row.dept_no || "-",
        row.dept_name,
        row.parent_name || "顶级部门",
        row.is_locked ? "是" : "否",
        <div className="toolbar">
          <button className="account-action-button" onClick={() => openEdit(row)} type="button">编辑</button>
          <button className="account-action-button account-action-button--danger" onClick={() => removeDepartment(row)} type="button">删除</button>
        </div>,
      ]);
  const departmentTableSortRows = loading
    ? []
    : rows.map((row) => [
        "",
        row.id,
        row.dept_no || "-",
        row.dept_name,
        row.parent_name || "顶级部门",
        row.is_locked ? "是" : "否",
        "",
      ]);

  return (
    <main className="master-data-page department-master-page">
      {/* 顶部控制与摘要行 */}
      <div className="account-top-control-row" style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "12px",
        marginBottom: "16px",
        marginTop: "16px"
      }}>
        {/* 左侧控制按钮组 */}
        <div className="account-panel-selector" style={{ display: "flex", gap: "10px" }}>
          <button
            className="btn btn-outline-secondary"
            onClick={() => setShowModal("create")}
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            新建部门
          </button>
          <button
            className="btn btn-outline-secondary"
            onClick={() => setShowModal("import")}
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            导入/导出部门
          </button>
          <button
            className="btn btn-outline-secondary"
            onClick={removeUnboundDepartments}
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
            一键删除空部门
          </button>
        </div>

        {/* 右侧信息摘要状态条 */}
        <div className="active-account-set-summary-bar" style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          minHeight: "36px",
          boxSizing: "border-box",
          padding: "0 16px",
          background: "var(--ent-secondary-bg, #f8fafc)",
          border: "1px solid var(--ent-border-strong)",
          borderRadius: "var(--ent-radius-lg, 8px)",
          fontSize: "13.5px",
          color: "var(--ent-text)",
          boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.02)"
        }}>
          <div className="admin-row">
            <span style={{ color: "var(--ent-text-secondary)", fontWeight: "500" }}>部门总数：</span>
            <strong style={{ color: "var(--ent-primary)" }}>{rows.length} 个</strong>
          </div>
          <div style={{ width: "1px", height: "16px", background: "var(--ent-border-strong)", opacity: 0.6 }} />
          <div className="admin-row">
            <span style={{ color: "var(--ent-text-secondary)" }}>锁定部门：</span>
            <strong style={{ color: "var(--ent-primary)" }}>{rows.filter(r => r.is_locked).length} 个</strong>
          </div>
        </div>
      </div>

      <div className="account-card-header master-list-header" style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 4px",
        borderBottom: "none",
        background: "transparent",
        flexWrap: "wrap",
        gap: "12px"
      }}>
        <span style={{ fontSize: "16px", fontWeight: "600", color: "var(--ent-text)" }}>部门列表</span>
        <div className="toolbar" style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span className="master-selected-count">已选 {selectedIds.length} 项</span>
          <select className="account-select master-batch-select" onChange={(event) => setBatchAction(event.target.value)} value={batchAction}>
            <option value="">批量操作</option>
            <option value="set_parent">更改上级部门</option>
            <option value="lock">锁定部门</option>
            <option value="unlock">取消锁定</option>
            <option value="delete">删除部门</option>
          </select>
          <button className="account-action-button account-action-button--primary" onClick={applyBatchAction} type="button">执行</button>
          <a className="account-action-button account-action-button--success" href="/api/admin/departments/export">导出全部部门</a>
          <button className="account-action-button" onClick={loadRows} type="button">刷新</button>
        </div>
      </div>

      <QueryResultPanel>
        {loading ? (
          <div className="legacy-table-panel master-table-panel">
            <div className="legacy-table-wrap">
              <table className="legacy-table master-table">
                <tbody>
                  <tr><td className="legacy-table-empty-cell">正在加载部门列表...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <QueryTable
            emptyText="暂无部门数据"
            headers={departmentTableHeaders}
            panelClassName="master-table-panel"
            rows={departmentTableRows}
            sortRows={departmentTableSortRows}
            tableClassName="master-table"
          />
        )}
      </QueryResultPanel>

      {editing ? (
        <div className="master-modal-backdrop">
          <form className="master-modal department-parent-modal" onSubmit={submitEdit} style={{ maxWidth: "550px", width: "100%" }}>
            <div className="master-modal-header">
              <h2>编辑部门</h2>
              <button className="master-modal-close" onClick={() => setEditing(null)} type="button">×</button>
            </div>
            <div className="master-modal-body" style={{ display: "flex", flexDirection: "column", gap: "24px", overflow: "visible" }}>
              {/* 基础信息 */}
              <div className="admin-stack">
                <h4 className="admin-modal-title">基础信息</h4>
                <div className="admin-form-grid">
                  <label className="account-field" style={{ margin: 0 }}>
                    <span className="account-field-label">部门编号</span>
                    <input className="account-input" onChange={(event) => setEditForm({ ...editForm, dept_no: event.target.value })} required value={editForm.dept_no} placeholder="请输入部门编号" />
                  </label>
                  <label className="account-field" style={{ margin: 0 }}>
                    <span className="account-field-label">部门名称</span>
                    <input className="account-input" onChange={(event) => setEditForm({ ...editForm, dept_name: event.target.value })} required value={editForm.dept_name} placeholder="请输入部门名称" />
                  </label>
                  <label className="account-field admin-form-grid-wide">
                    <span className="account-field-label">上级部门</span>
                    <DepartmentPicker
                      departments={rows}
                      excludedId={editing.id}
                      hiddenId="editDeptParentId"
                      inputId="editDeptParentInput"
                      lookupId="editDeptParentLookup"
                      onChange={(value) => setEditForm({ ...editForm, parent_id: value })}
                      pickerTitle="选择上级部门"
                      placeholder="选择上级部门"
                      quickListId="editDeptParentQuickList"
                      title="选择上级部门"
                      triggerId="openEditDeptParentPickerBtn"
                      value={editForm.parent_id}
                    />
                  </label>
                </div>
              </div>

              {/* 附加状态 */}
              <div className="admin-stack">
                <h4 className="admin-modal-title">附加状态</h4>
                <div style={{ display: "flex", gap: "32px", padding: "12px 16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <label className="master-check-option" style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input checked={editForm.is_locked} onChange={(event) => setEditForm({ ...editForm, is_locked: event.target.checked })} type="checkbox" style={{ width: "16px", height: "16px", accentColor: "#2563eb", cursor: "pointer", margin: 0 }} />
                    <span className="admin-text">锁定部门</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="master-modal-footer">
              <button className="account-action-button" onClick={() => setEditing(null)} type="button" style={{ borderRadius: "8px", fontSize: "14px" }}>取消</button>
              <button className="account-action-button account-action-button--primary" type="submit" style={{ padding: "8px 28px", borderRadius: "8px", fontWeight: "500", fontSize: "14px", boxShadow: "0 2px 4px rgba(37, 99, 235, 0.2)" }}>保存</button>
            </div>
          </form>
        </div>
      ) : null}

      {batchParentModalOpen ? (
        <div className="master-modal-backdrop">
          <div className="master-modal department-parent-modal">
            <div className="master-modal-header">
              <h2>批量更改上级部门</h2>
              <button className="master-modal-close" onClick={() => setBatchParentModalOpen(false)} type="button">×</button>
            </div>
            <div className="master-modal-body">
              <label className="account-field">
                <span className="account-field-label">上级部门</span>
                <DepartmentPicker
                  departments={rows}
                  hiddenId="batchParentDeptId"
                  inputId="batchParentDeptInput"
                  lookupId="batchDeptParentLookup"
                  onChange={setBatchParentId}
                  pickerTitle="选择上级部门"
                  placeholder="选择上级部门"
                  quickListId="batchParentDeptQuickList"
                  title="选择上级部门"
                  triggerId="openBatchDeptParentPickerBtn"
                  value={batchParentId}
                />
              </label>
              <div className="master-form-text">将应用到已选 {selectedIds.length} 个部门。</div>
            </div>
            <div className="master-modal-footer">
              <button className="account-action-button" onClick={() => setBatchParentModalOpen(false)} type="button">取消</button>
              <button className="account-action-button account-action-button--primary" onClick={applyBatchParent} type="button">保存</button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="master-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) handleCloseModal(); }} style={{
        position: "fixed",
        left: showModal === "create" ? "0" : "-9999px",
        top: "0",
        width: "100%",
        height: "100%",
        zIndex: 1500,
        background: "rgba(15, 23, 42, 0.3)",
        backdropFilter: "blur(8px)",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        boxSizing: "border-box",
        opacity: showModal === "create" ? 1 : 0,
        pointerEvents: showModal === "create" ? "auto" : "none",
        transition: "opacity 0.15s ease"
      }}>
        <div className="master-modal-container department-parent-modal" style={{ width: "100%", maxWidth: "550px", background: "#fff", borderRadius: "12px", padding: "28px", boxSizing: "border-box", position: "relative" }}>
          <button className="master-modal-close admin-modal-close" onClick={handleCloseModal} type="button">×</button>
          <div style={{ borderBottom: "1px solid var(--ent-border)", paddingBottom: "12px", marginBottom: "20px" }}>
            <span style={{ fontSize: "16px", fontWeight: "600", color: "var(--ent-text)" }}>新增部门</span>
          </div>
          <form className="account-create-form admin-stack-lg" onSubmit={submitCreate} >
            {/* 基础信息 */}
            <div className="admin-stack">
              <h4 className="admin-modal-title">基础信息</h4>
              <div className="admin-form-grid">
                <label className="account-field" style={{ margin: 0 }}>
                  <span className="account-field-label">部门编号</span>
                  <input className="account-input" onChange={(event) => setForm({ ...form, dept_no: event.target.value })} required value={form.dept_no} placeholder="请输入部门编号" />
                </label>
                <label className="account-field" style={{ margin: 0 }}>
                  <span className="account-field-label">部门名称</span>
                  <input className="account-input" onChange={(event) => setForm({ ...form, dept_name: event.target.value })} required value={form.dept_name} placeholder="请输入部门名称" />
                </label>
                <label className="account-field admin-form-grid-wide">
                  <span className="account-field-label">上级部门</span>
                  <DepartmentPicker
                    departments={rows}
                    hiddenId="createDeptParentId"
                    inputId="createDeptParentInput"
                    lookupId="createDeptParentLookup"
                    onChange={(value) => setForm({ ...form, parent_id: value })}
                    pickerTitle="选择上级部门"
                    placeholder="选择上级部门"
                    quickListId="createDeptParentQuickList"
                    title="选择上级部门"
                    triggerId="openCreateDeptParentPickerBtn"
                    value={form.parent_id}
                  />
                </label>
              </div>
            </div>

            {/* 附加状态 */}
            <div className="admin-stack">
              <h4 className="admin-modal-title">附加状态</h4>
              <div style={{ display: "flex", gap: "32px", padding: "12px 16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <label className="master-check-option" style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input checked={form.is_locked} onChange={(event) => setForm({ ...form, is_locked: event.target.checked })} type="checkbox" style={{ width: "16px", height: "16px", accentColor: "#2563eb", cursor: "pointer", margin: 0 }} />
                  <span className="admin-text">锁定部门</span>
                </label>
              </div>
            </div>

            <div style={{ marginTop: "8px", display: "flex", justifyContent: "flex-end", borderTop: "1px solid #e2e8f0", paddingTop: "20px" }}>
              <button className="account-action-button account-action-button--primary account-primary-button" type="submit" style={{ padding: "8px 28px", borderRadius: "8px", fontWeight: "500", fontSize: "14px", boxShadow: "0 2px 4px rgba(37, 99, 235, 0.2)" }}>
                创建部门
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="master-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) handleCloseModal(); }} style={{
        position: "fixed",
        left: showModal === "import" ? "0" : "-9999px",
        top: "0",
        width: "100%",
        height: "100%",
        zIndex: 1500,
        background: "rgba(15, 23, 42, 0.3)",
        backdropFilter: "blur(8px)",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        boxSizing: "border-box",
        opacity: showModal === "import" ? 1 : 0,
        pointerEvents: showModal === "import" ? "auto" : "none",
        transition: "opacity 0.15s ease"
      }}>
        <div className="master-modal-container" style={{ width: "100%", maxWidth: "600px", background: "#fff", borderRadius: "12px", padding: "28px", boxSizing: "border-box", position: "relative" }}>
          <button className="master-modal-close admin-modal-close" onClick={handleCloseModal} type="button">×</button>
          <div style={{ borderBottom: "1px solid var(--ent-border)", paddingBottom: "12px", marginBottom: "20px" }}>
            <span style={{ fontSize: "16px", fontWeight: "600", color: "var(--ent-text)" }}>数据导入与导出</span>
          </div>

          <div className="admin-stack-lg">
            {/* 批量导入专区 */}
            <form className="account-upload-group" encType="multipart/form-data" onSubmit={submitImport} style={{ display: "flex", flexDirection: "column", gap: "16px", margin: 0 }}>
              <div
                className={`account-upload-dropzone${isDragOver ? " is-dragover" : ""}`}
                style={{
                  padding: "32px 20px",
                  background: isDragOver ? "#eff6ff" : "#f8fafc",
                  border: isDragOver ? "2px dashed #3b82f6" : "1px dashed #cbd5e1",
                  borderRadius: "8px",
                  textAlign: "center",
                  transition: "all 0.2s ease",
                  cursor: "pointer",
                }}
                onClick={() => document.getElementById("department-import-input")?.click()}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  const droppedFile = e.dataTransfer.files?.[0] ?? null;
                  if (droppedFile) {
                    setImportFile(droppedFile);
                  }
                }}
              >
                <div style={{ marginBottom: "16px", color: importFile ? "#3b82f6" : "#64748b" }}>
                  {importFile ? (
                    <svg
                      width="36"
                      height="36"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ display: "inline-block" }}
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  ) : (
                    <svg
                      width="36"
                      height="36"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ display: "inline-block" }}
                    >
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  )}
                </div>
                <div style={{ marginBottom: "8px", fontSize: "15px", color: "#1e293b", fontWeight: "600" }}>
                  {importFile ? importFile.name : "点击选择，或将 Excel 文件拖拽到这里"}
                </div>
                <div style={{ fontSize: "13px", color: "#64748b" }}>
                  {importFile ? `大小: ${(importFile.size / 1024).toFixed(1)} KB` : "支持 .xlsx 格式文件"}
                </div>
                <input
                  id="department-import-input"
                  key={importInputKey}
                  className="account-file-input"
                  name="file"
                  type="file"
                  accept=".xlsx"
                  style={{ display: "none" }}
                  onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <a className="account-action-button" href="/api/admin/departments/template" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "13.5px", padding: "8px 16px", borderRadius: "6px", color: "#2563eb", background: "#eff6ff", border: "1px solid #bfdbfe", fontWeight: "500", textDecoration: "none" }}>
                  ↓ 下载示例模板
                </a>
                <button className={`account-action-button account-action-button--primary${isImporting ? " is-loading" : ""}`} disabled={isImporting} type="submit" style={{ padding: "8px 32px", borderRadius: "8px", fontWeight: "500", fontSize: "14px", boxShadow: "0 2px 4px rgba(37, 99, 235, 0.2)" }}>
                  {isImporting ? "导入中..." : "开始导入"}
                </button>
              </div>
            </form>

            <div style={{ height: "1px", background: "#e2e8f0" }}></div>

            {/* 数据导出专区 */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <h4 style={{ margin: 0, fontSize: "14px", fontWeight: "600", color: "#1e293b" }}>数据导出</h4>
              <div style={{ display: "flex", gap: "12px" }}>
                <a className="account-action-button" href="/api/admin/departments/export" style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "8px", borderRadius: "6px", fontSize: "13.5px", textDecoration: "none" }}>导出全部部门数据</a>
              </div>
            </div>

            <div className="panel-note" style={{ margin: 0, padding: "12px 16px", background: "#fffbeb", borderRadius: "8px", color: "#92400e", fontSize: "13px", border: "1px solid #fde68a", lineHeight: "1.6" }}>
              <strong style={{ color: "#78350f" }}>模板列要求：</strong><br/>
              部门编号、部门名称、上级部门编号（可空）。
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
