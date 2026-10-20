import React, { useState, useMemo, useCallback } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { StatusBadge } from "../components/shared/StatusBadge";
import ConfirmModal from "../components/shared/ConfirmModal";
import { Button } from "../components/Buttons";
import { useNotifications, NotificationItem } from "../hooks/useNotifications";
import "./NotificationsPage.css";

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAllAsRead, clearAll, toggleReadStatus } = useNotifications();
  const [activeTab, setActiveTab] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const filtered = useMemo(() => {
    if (activeTab === "all") return notifications;
    if (activeTab === "read") return notifications.filter((n: NotificationItem) => n.read);
    return notifications.filter((n: NotificationItem) => n.type === activeTab && !n.read);
  }, [notifications, activeTab]);

  const tabs = useMemo(() => [
    { key: "all", label: "All" },
    { key: "alert", label: "Alerts", count: notifications.filter((n: NotificationItem) => n.type === "alert" && !n.read).length },
    { key: "success", label: "Success", count: notifications.filter((n: NotificationItem) => n.type === "success" && !n.read).length },
    { key: "system", label: "System", count: notifications.filter((n: NotificationItem) => n.type === "system" && !n.read).length },
    { key: "read", label: "Read" },
  ], [notifications]);

  const grouped = useMemo(() => {
    return filtered.reduce((acc: Record<string, NotificationItem[]>, n: NotificationItem) => {
      const dateKey = n.isToday ? 'TODAY' : 'EARLIER';
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(n);
      return acc;
    }, {});
  }, [filtered]);

  const handleClearConfirm = useCallback(() => {
    clearAll();
    setSelectedIds([]);
    setShowClearConfirm(false);
  }, [clearAll]);

  return (
    <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '24px', minHeight: 'calc(100vh - 120px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#0F172A' }}>Notifications</h2>
      </div>

      <div className="notif-actions-row">
        <div style={{ display: 'flex', gap: '10px' }}>
          <Button title="Mark all as read" icon="ti-check" variant="secondary" onClick={markAllAsRead} disabled={unreadCount === 0} />
          <Button title="Clear all" icon="ti-trash" variant="secondary" onClick={() => setShowClearConfirm(true)} disabled={notifications.length === 0} />
        </div>
        <span className="notif-unread-count">{unreadCount} unread notifications</span>
      </div>

      <div className="notif-layout">
        <div className="notif-list-panel">
          <div className="notif-tabs">
            {tabs.map((tab) => (
              <button key={tab.key} className={`notif-tab ${activeTab === tab.key ? "active" : ""}`} onClick={() => setActiveTab(tab.key)}>
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`notif-tab-count ${tab.key}`}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>

          <div className="notif-list">
            {filtered.length === 0 ? (
              <div className="notif-empty-state">
                <Bell size={28} color="#94A3B8" />
                <div style={{ marginTop: '12px', fontWeight: 600, color: '#64748B' }}>No Notifications</div>
              </div>
            ) : (
              Object.entries(grouped).map(([date, items]) => (
                <div key={date}>
                  <div className="notif-date-header">{date}</div>
                  {items.map((n: NotificationItem) => (
                    <div
                      key={n.id}
                      className={`notif-item ${selectedIds.includes(n.id) ? "selected" : ""} ${!n.read ? "unread" : ""}`}
                      onClick={() => {
                        if (!n.read) toggleReadStatus(n.id);
                        if (n.link) navigate(n.link);
                      }}
                      style={{ cursor: n.link ? 'pointer' : 'default' }}
                    >
                      <input
                        type="checkbox"
                        className="notif-checkbox"
                        checked={selectedIds.includes(n.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          setSelectedIds(prev => prev.includes(n.id) ? prev.filter(id => id !== n.id) : [...prev, n.id]);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="notif-item-content">
                        <div className="notif-item-header">
                          <strong style={{ color: !n.read ? '#0F172A' : '#64748B' }}>{n.title}</strong>
                          {n.waybillNo && <span className="notif-waybill">{n.waybillNo}</span>}
                          {n.statusBadge && <StatusBadge status={n.statusBadge} />}
                        </div>
                        <p className="notif-item-desc">{n.description}</p>
                        <span className="notif-item-meta">{n.timestamp} · {n.source}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={showClearConfirm}
        title="Clear all notifications?"
        message="This will permanently delete all notifications. This action is irreversible."
        variant="danger"
        confirmLabel="Clear Notifications"
        cancelLabel="Cancel"
        icon="ti-trash"
        onCancel={() => setShowClearConfirm(false)}
        onConfirm={handleClearConfirm}
      />
    </div>
  );
};

export default NotificationsPage;
