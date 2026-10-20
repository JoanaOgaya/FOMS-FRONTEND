import React, { useState, useMemo, useCallback } from "react";
import { Bell, Trash2, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useClientContext } from "../context/ClientContext";
import "./NotificationsPage.css";

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useClientContext();
  const [activeTab, setActiveTab] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleMarkAllAsRead = useCallback(async () => {
    await markAllAsRead();
  }, [markAllAsRead]);

  const handleMarkRead = useCallback(async (id: string) => {
    await markAsRead(id);
  }, [markAsRead]);

  // Group notification by today vs earlier
  const enriched = useMemo(() => {
    const now = new Date();
    return notifications.map(n => {
      const created = new Date(n.createdAt);
      const isToday = created.toDateString() === now.toDateString();

      // compute time ago
      const diffMs = now.getTime() - created.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      let timeAgo = 'just now';
      if (diffMins >= 1 && diffMins < 60) timeAgo = `${diffMins}m ago`;
      else if (diffHours >= 1 && diffHours < 24) timeAgo = `${diffHours}h ago`;
      else if (diffDays >= 1) timeAgo = `${diffDays}d ago`;

      return {
        ...n,
        isToday,
        timestamp: timeAgo,
        link: n.relatedInvoiceId ? '/history' : undefined
      };
    });
  }, [notifications]);

  const filtered = useMemo(() => {
    if (activeTab === "all") return enriched;
    if (activeTab === "read") return enriched.filter(n => n.read);
    return enriched.filter(n => n.type === activeTab && !n.read);
  }, [enriched, activeTab]);

  const tabs = useMemo(() => [
    { key: "all", label: "All" },
    { key: "alert", label: "Alerts", count: enriched.filter(n => n.type === "alert" && !n.read).length },
    { key: "success", label: "Success", count: enriched.filter(n => n.type === "success" && !n.read).length },
    { key: "system", label: "System", count: enriched.filter(n => n.type === "system" && !n.read).length },
    { key: "read", label: "Read" },
  ], [enriched]);

  const grouped = useMemo(() => {
    return filtered.reduce((acc: Record<string, typeof filtered>, n) => {
      const dateKey = n.isToday ? 'TODAY' : 'EARLIER';
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(n);
      return acc;
    }, {});
  }, [filtered]);

  return (
    <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '24px', minHeight: 'calc(100vh - 120px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#0F172A' }}>Notifications</h2>
      </div>

      <div className="notif-actions-row">
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={handleMarkAllAsRead} 
            disabled={unreadCount === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#475569', fontWeight: 600, fontSize: '13px', cursor: unreadCount === 0 ? 'not-allowed' : 'pointer', opacity: unreadCount === 0 ? 0.6 : 1 }}
          >
            <CheckCheck size={16} /> Mark all as read
          </button>
          <button 
            onClick={() => setShowClearConfirm(true)} 
            disabled={notifications.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#DC2626', fontWeight: 600, fontSize: '13px', cursor: notifications.length === 0 ? 'not-allowed' : 'pointer', opacity: notifications.length === 0 ? 0.6 : 1 }}
          >
            <Trash2 size={16} /> Clear all
          </button>
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
                <div style={{ marginTop: '4px', fontSize: '13px', color: '#94A3B8' }}>
                  Payment updates from Finance will appear here
                </div>
              </div>
            ) : (
              Object.entries(grouped).map(([date, items]) => (
                <div key={date}>
                  <div className="notif-date-header">{date}</div>
                  {(items as any[]).map((n: any) => (
                    <div 
                      key={n.id} 
                      className={`notif-item ${selectedId === n.id ? "selected" : ""} ${!n.read ? "unread" : ""}`} 
                      onClick={() => {
                        setSelectedId(n.id);
                        if (!n.read) handleMarkRead(n.id);
                        if (n.link) navigate(n.link);
                      }}
                      style={{ cursor: 'pointer' }}
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
                          {n.invoiceNo && (
                            <span style={{ marginLeft: '8px', fontSize: '11px', background: '#F0F9FF', color: '#0284C7', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                              {n.invoiceNo}
                            </span>
                          )}
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
      
      {showClearConfirm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#FFF', borderRadius: '12px', width: '400px', padding: '24px', textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px' }}>Clear all notifications?</h3>
            <p style={{ margin: '0 0 24px 0', color: '#64748B' }}>This will mark all notifications as read. Payment history data in your account won't be affected.</p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setShowClearConfirm(false)} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#F8FAFC', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button
                onClick={async () => { await markAllAsRead(); setShowClearConfirm(false); }}
                style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', background: '#DC2626', color: '#FFF', cursor: 'pointer', fontWeight: 600 }}
              >
                Mark All Read
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
