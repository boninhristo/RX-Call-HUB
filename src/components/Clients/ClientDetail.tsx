import { useState, useEffect } from "react";
import { formatDateTime } from "../../lib/format";
import type {
  Client,
  ClientMeeting,
  ConversationTextScript,
  Conversation,
  ClientOrder,
  ClientPurchase,
  CustomField,
} from "../../lib/db";
import {
  getClientCustomFields,
  setClientCustomField,
  deleteClientCustomField,
  getClientConversations,
  addConversation,
  updateConversation,
  deleteConversation,
  listConversationTextScripts,
  getClientMeetings,
  addClientMeeting,
  updateClientMeeting,
  deleteClientMeeting,
  getClientOrders,
  addClientOrder,
  updateClientOrder,
  deleteClientOrder,
  getClientPurchases,
  addClientPurchase,
  updateClientPurchase,
  deleteClientPurchase,
  updateClient,
  createConversationReminder,
} from "../../lib/db";
import { ClientForm } from "./ClientForm";

interface ClientDetailProps {
  client: Client;
  onBack: () => void;
  onUpdated: () => void;
}

type Tab = "info" | "conversations" | "meetings" | "orders" | "products" | "custom";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  shipped: "Shipped",
  delivered: "Delivered",
};

export function ClientDetail({ client, onBack, onUpdated }: ClientDetailProps) {
  const [tab, setTab] = useState<Tab>("info");
  const [editing, setEditing] = useState(false);
  const [clientData, setClientData] = useState(client);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [meetings, setMeetings] = useState<ClientMeeting[]>([]);
  const [orders, setOrders] = useState<ClientOrder[]>([]);
  const [purchases, setPurchases] = useState<ClientPurchase[]>([]);

  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldValue, setNewFieldValue] = useState("");
  const [convDate, setConvDate] = useState(new Date().toISOString().slice(0, 16));
  const [convType, setConvType] = useState<"phone" | "in_person">("phone");
  const [convNotes, setConvNotes] = useState("");
  const [scripts, setScripts] = useState<ConversationTextScript[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [showScriptPanel, setShowScriptPanel] = useState(false);
  const [orderStatus, setOrderStatus] = useState("pending");
  const [orderAmount, setOrderAmount] = useState("");
  const [orderPaymentDate, setOrderPaymentDate] = useState("");
  const [orderDesc, setOrderDesc] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [purchaseBrand, setPurchaseBrand] = useState("");
  const [purchaseModel, setPurchaseModel] = useState("");
  const [purchaseValue, setPurchaseValue] = useState("");
  const [purchaseNote, setPurchaseNote] = useState("");
  const [editingPurchase, setEditingPurchase] = useState<ClientPurchase | null>(null);
  const [editingConversation, setEditingConversation] = useState<Conversation | null>(null);
  const [meetScheduled, setMeetScheduled] = useState(() => new Date().toISOString().slice(0, 16));
  const [meetAddress, setMeetAddress] = useState("");
  const [meetContactPerson, setMeetContactPerson] = useState("");
  const [meetPhone, setMeetPhone] = useState("");
  const [meetOutcome, setMeetOutcome] = useState("");
  const [editingMeeting, setEditingMeeting] = useState<ClientMeeting | null>(null);
  const [editingOrder, setEditingOrder] = useState<ClientOrder | null>(null);
  const [editingCustomField, setEditingCustomField] = useState<CustomField | null>(null);
  const [reminderFor, setReminderFor] = useState<Conversation | null>(null);
  const [reminderAtLocal, setReminderAtLocal] = useState("");
  const [reminderSaving, setReminderSaving] = useState(false);

  const loadData = async () => {
    const [fields, convs, meets, ords, purchs] = await Promise.all([
      getClientCustomFields(client.id),
      getClientConversations(client.id),
      getClientMeetings(client.id),
      getClientOrders(client.id),
      getClientPurchases(client.id),
    ]);
    setCustomFields(fields);
    setConversations(convs);
    setMeetings(meets);
    setOrders(ords);
    setPurchases(purchs);
  };

  useEffect(() => {
    loadData();
  }, [client.id]);

  useEffect(() => {
    listConversationTextScripts().then(setScripts).catch(() => setScripts([]));
  }, []);

  useEffect(() => {
    setShowScriptPanel(false);
  }, [selectedScriptId]);

  const handleUpdateClient = async (data: any) => {
    await updateClient(client.id, data);
    setClientData({ ...clientData, ...data });
    setEditing(false);
    onUpdated();
  };

  const handleAddCustomField = async () => {
    if (!newFieldName.trim()) return;
    await setClientCustomField(client.id, newFieldName.trim(), newFieldValue);
    setNewFieldName("");
    setNewFieldValue("");
    loadData();
  };

  const selectedScript = selectedScriptId != null ? scripts.find((s) => s.id === selectedScriptId) ?? null : null;

  const openReminderModal = (c: Conversation) => {
    setReminderFor(c);
    const d = new Date();
    d.setSeconds(0, 0);
    d.setMilliseconds(0);
    const m = d.getMinutes();
    const next = Math.ceil(m / 30) * 30;
    d.setMinutes(next);
    if (d.getMinutes() >= 60) {
      d.setHours(d.getHours() + 1);
      d.setMinutes(0);
    }
    const tz = d.getTimezoneOffset() * 60000;
    setReminderAtLocal(new Date(d.getTime() - tz).toISOString().slice(0, 16));
  };

  const handleSaveReminder = async () => {
    if (!reminderFor || !reminderAtLocal) return;
    setReminderSaving(true);
    try {
      await createConversationReminder({
        clientId: client.id,
        conversationId: reminderFor.id,
        remindAtInput: reminderAtLocal,
      });
      window.dispatchEvent(new CustomEvent("klienti-reminders-changed"));
      setReminderFor(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setReminderSaving(false);
    }
  };

  const handleAddConversation = async () => {
    await addConversation(client.id, convDate, convType, convNotes);
    setConvNotes("");
    loadData();
  };

  const handleAddOrder = async () => {
    await addClientOrder(client.id, {
      status: orderStatus,
      amount: orderAmount ? parseFloat(orderAmount) : undefined,
      payment_date: orderPaymentDate || undefined,
      description: orderDesc || undefined,
    });
    setOrderAmount("");
    setOrderPaymentDate("");
    setOrderDesc("");
    loadData();
  };

  const handleUpdateOrderStatus = async (orderId: number, status: "pending" | "confirmed" | "shipped" | "delivered") => {
    await updateClientOrder(orderId, { status });
    loadData();
  };

  const handleAddPurchase = async () => {
    await addClientPurchase(client.id, {
      purchase_date: purchaseDate,
      brand: purchaseBrand || undefined,
      model: purchaseModel || undefined,
      value: purchaseValue ? parseFloat(purchaseValue) : undefined,
      note: purchaseNote || undefined,
    });
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setPurchaseBrand("");
    setPurchaseModel("");
    setPurchaseValue("");
    setPurchaseNote("");
    loadData();
  };

  const handleUpdatePurchase = async () => {
    if (!editingPurchase) return;
    await updateClientPurchase(editingPurchase.id, {
      purchase_date: purchaseDate,
      brand: purchaseBrand || undefined,
      model: purchaseModel || undefined,
      value: purchaseValue ? parseFloat(purchaseValue) : undefined,
      note: purchaseNote || undefined,
    });
    setEditingPurchase(null);
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setPurchaseBrand("");
    setPurchaseModel("");
    setPurchaseValue("");
    setPurchaseNote("");
    loadData();
  };

  const handleEditPurchase = (p: ClientPurchase) => {
    setEditingPurchase(p);
    setPurchaseDate(p.purchase_date);
    setPurchaseBrand(p.brand ?? "");
    setPurchaseModel(p.model ?? "");
    setPurchaseValue(p.value?.toString() ?? "");
    setPurchaseNote(p.note ?? "");
  };

  const handleEditConversation = (c: Conversation) => {
    setEditingConversation(c);
    const d = c.date.includes("T") ? c.date.slice(0, 16) : c.date + "T00:00";
    setConvDate(d);
    setConvType(c.type);
    setConvNotes(c.notes ?? "");
  };

  const handleUpdateConversation = async () => {
    if (!editingConversation) return;
    await updateConversation(editingConversation.id, {
      date: convDate,
      type: convType,
      notes: convNotes,
    });
    setEditingConversation(null);
    setConvNotes("");
    loadData();
  };

  const handleAddMeeting = async () => {
    const iso = new Date(meetScheduled).toISOString();
    await addClientMeeting(client.id, iso, meetOutcome.trim() || null, {
      meeting_address: meetAddress.trim() || null,
      contact_person: meetContactPerson.trim() || null,
      phone: meetPhone.trim() || null,
    });
    setMeetOutcome("");
    setMeetAddress("");
    setMeetContactPerson("");
    setMeetPhone("");
    setMeetScheduled(new Date().toISOString().slice(0, 16));
    loadData();
  };

  const handleUpdateMeeting = async () => {
    if (!editingMeeting) return;
    await updateClientMeeting(editingMeeting.id, {
      scheduled_at: new Date(meetScheduled).toISOString(),
      outcome_notes: meetOutcome || null,
      meeting_address: meetAddress.trim() || null,
      contact_person: meetContactPerson.trim() || null,
      phone: meetPhone.trim() || null,
    });
    setEditingMeeting(null);
    setMeetOutcome("");
    setMeetAddress("");
    setMeetContactPerson("");
    setMeetPhone("");
    loadData();
  };

  const handleEditMeeting = (m: ClientMeeting) => {
    setEditingMeeting(m);
    const d = new Date(m.scheduled_at);
    const pad = (n: number) => String(n).padStart(2, "0");
    setMeetScheduled(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
    setMeetAddress(m.meeting_address ?? "");
    setMeetContactPerson(m.contact_person ?? "");
    setMeetPhone(m.phone ?? "");
    setMeetOutcome(m.outcome_notes ?? "");
  };

  const handleEditOrder = (o: ClientOrder) => {
    setEditingOrder(o);
    setOrderStatus(o.status);
    setOrderAmount(o.amount?.toString() ?? "");
    setOrderPaymentDate(o.payment_date ?? "");
    setOrderDesc(o.description ?? "");
  };

  const handleUpdateOrder = async () => {
    if (!editingOrder) return;
    await updateClientOrder(editingOrder.id, {
      status: orderStatus as "pending" | "confirmed" | "shipped" | "delivered",
      amount: orderAmount ? parseFloat(orderAmount) : undefined,
      payment_date: orderPaymentDate || undefined,
      description: orderDesc || undefined,
    });
    setEditingOrder(null);
    setOrderAmount("");
    setOrderPaymentDate("");
    setOrderDesc("");
    loadData();
  };

  const handleEditCustomField = (f: CustomField) => {
    setEditingCustomField(f);
    setNewFieldName(f.field_name);
    setNewFieldValue(f.field_value ?? "");
  };

  const handleUpdateCustomField = async () => {
    if (!editingCustomField) return;
    await setClientCustomField(client.id, editingCustomField.field_name, newFieldValue);
    setEditingCustomField(null);
    setNewFieldName("");
    setNewFieldValue("");
    loadData();
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "info", label: "Info" },
    { id: "conversations", label: "Conversations" },
    { id: "meetings", label: "Meetings" },
    { id: "orders", label: "Orders" },
    { id: "products", label: "Products" },
    { id: "custom", label: "Custom Fields" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="text-[var(--color-accent)] hover:text-[var(--color-text)] text-sm"
        >
          ← Back
        </button>
        <h2 className="text-lg font-medium text-[var(--color-text-bright)]">{clientData.name}</h2>
        {clientData.company && (
          <span className="text-sm text-[var(--color-accent)]">{clientData.company}</span>
        )}
      </div>

      <div className="flex gap-2 border-b border-[var(--color-bg-card)] pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              tab === t.id ? "bg-[var(--color-bg-card)] text-[var(--color-text-bright)]" : "text-[var(--color-accent)] hover:bg-[var(--color-bg-card)]/50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "info" && (
        <div>
          {editing ? (
            <ClientForm
              client={clientData}
              onSubmit={handleUpdateClient}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div className="space-y-3 max-w-xl">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="col-span-2">
                  <span className="text-[var(--color-accent)]">Turnover:</span> {clientData.turnover || "—"}
                </div>
                <div><span className="text-[var(--color-accent)]">Phone:</span> {clientData.phone || "—"}</div>
                <div><span className="text-[var(--color-accent)]">Email:</span> {clientData.email || "—"}</div>
                <div className="col-span-2"><span className="text-[var(--color-accent)]">Address:</span> {clientData.address || "—"}</div>
                <div><span className="text-[var(--color-accent)]">EIK:</span> {clientData.eik || "—"}</div>
                <div><span className="text-[var(--color-accent)]">VAT:</span> {clientData.vat_number || "—"}</div>
                <div><span className="text-[var(--color-accent)]">Contact:</span> {clientData.contact_person || "—"}</div>
                <div><span className="text-[var(--color-accent)]">Bank:</span> {clientData.bank_account || "—"}</div>
              </div>
              {clientData.notes && (
                <div>
                  <span className="text-[var(--color-accent)]">Notes:</span>
                  <p className="mt-1 text-[var(--color-text)]">{clientData.notes}</p>
                </div>
              )}
              <button
                onClick={() => setEditing(true)}
                className="px-4 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm hover:bg-[var(--color-bg-card)]/80"
              >
                Edit
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "conversations" && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap items-end">
            <input
              type="datetime-local"
              value={convDate}
              onChange={(e) => setConvDate(e.target.value)}
              className="conversation-field px-3 py-2 rounded-lg text-[var(--color-text)] text-sm"
            />
            <select
              value={convType}
              onChange={(e) => setConvType(e.target.value as "phone" | "in_person")}
              className="conversation-field px-3 py-2 rounded-lg text-[var(--color-text)] text-sm"
            >
              <option value="phone">Phone</option>
              <option value="in_person">In Person</option>
            </select>
            {!editingConversation && (
              <select
                value={selectedScriptId ?? ""}
                onChange={(e) => setSelectedScriptId(e.target.value || null)}
                className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm min-w-[220px]"
              >
                <option value="">No script</option>
                {scripts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            <input
              type="text"
              placeholder="Notes"
              value={convNotes}
              onChange={(e) => setConvNotes(e.target.value)}
              className="conversation-field px-3 py-2 rounded-lg text-[var(--color-text)] text-sm flex-1 min-w-[200px]"
            />
            {editingConversation ? (
              <>
                <button onClick={handleUpdateConversation} className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm font-medium">Update</button>
                <button onClick={() => { setEditingConversation(null); setConvNotes(""); }} className="px-4 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm">Cancel</button>
              </>
            ) : (
              <button onClick={handleAddConversation} className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm font-medium">Add</button>
            )}
          </div>
          {!editingConversation && selectedScript && (
            <div className="p-3 rounded-lg border border-[var(--color-bg-card)] bg-[var(--color-bg-secondary)] space-y-3">
              <button
                type="button"
                onClick={() => setShowScriptPanel((v) => !v)}
                className="text-xs text-[var(--color-accent)] hover:text-[var(--color-text)]"
              >
                {showScriptPanel ? "Скрий скрипта" : "Покажи скрипта"}
              </button>
              {showScriptPanel && (
                <div className="rounded-lg bg-[var(--color-bg-card)]/50 p-3 text-xs text-[var(--color-text)] space-y-1 whitespace-pre-wrap">
                  {selectedScript.content}
                </div>
              )}
            </div>
          )}
          <div className="space-y-2">
            {conversations.map((c) => (
              <div
                key={c.id}
                className="p-3 rounded-lg bg-[var(--color-bg-card)] text-sm flex items-start justify-between gap-4 min-w-0"
              >
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="text-[10px] text-[var(--color-accent)]/60">{formatDateTime(c.created_at)}</div>
                  <div className="flex justify-between items-start">
                    <span className="text-[var(--color-accent)] break-words">
                      {new Date(c.date).toLocaleString()} • {c.type === "phone" ? "Phone" : "In Person"}
                    </span>
                  </div>
                  {c.notes && (
                    <p className="mt-1 text-[var(--color-text)] break-words [overflow-wrap:anywhere] break-all">
                      {c.notes}
                    </p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                  <button
                    type="button"
                    onClick={() => openReminderModal(c)}
                    className="px-2 py-1 rounded text-amber-300/90 hover:bg-amber-500/15 text-xs border border-amber-500/30"
                  >
                    Reminder
                  </button>
                  <button onClick={() => handleEditConversation(c)} className="px-2 py-1 rounded text-[var(--color-accent)] hover:bg-[var(--color-bg-secondary)] text-xs">Edit</button>
                  <button onClick={async () => { if (confirm("Delete?")) { await deleteConversation(c.id); loadData(); } }} className="px-2 py-1 rounded text-red-400/80 hover:bg-red-500/20 text-xs">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "meetings" && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-accent)]">
            Уговорена дата/час на срещата. След срещата допишете какво се е случило в полето „Резултат от срещата“.
          </p>
          <div className="flex flex-col gap-2 max-w-xl">
            <label className="text-xs text-[var(--color-accent)]">Дата и час на срещата</label>
            <input
              type="datetime-local"
              value={meetScheduled}
              onChange={(e) => setMeetScheduled(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm w-full max-w-xs"
            />
            <label className="text-xs text-[var(--color-accent)] mt-2">Адрес на срещата</label>
            <input
              type="text"
              placeholder="Адрес"
              value={meetAddress}
              onChange={(e) => setMeetAddress(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm w-full"
            />
            <label className="text-xs text-[var(--color-accent)] mt-1">Лице за контакт</label>
            <input
              type="text"
              placeholder="Име"
              value={meetContactPerson}
              onChange={(e) => setMeetContactPerson(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm w-full"
            />
            <label className="text-xs text-[var(--color-accent)] mt-1">Телефон</label>
            <input
              type="text"
              placeholder="Телефон"
              value={meetPhone}
              onChange={(e) => setMeetPhone(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm w-full"
            />
            <label className="text-xs text-[var(--color-accent)] mt-2">Резултат / бележки след срещата</label>
            <textarea
              placeholder="Какво се е случило на срещата…"
              value={meetOutcome}
              onChange={(e) => setMeetOutcome(e.target.value)}
              rows={3}
              className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm w-full"
            />
            {editingMeeting ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleUpdateMeeting}
                  className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm font-medium"
                >
                  Запази
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingMeeting(null);
                    setMeetOutcome("");
                    setMeetAddress("");
                    setMeetContactPerson("");
                    setMeetPhone("");
                  }}
                  className="px-4 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
                >
                  Отказ
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleAddMeeting}
                className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm font-medium w-fit"
              >
                Добави среща
              </button>
            )}
          </div>
          <div className="space-y-2">
            {meetings.map((m) => (
              <div
                key={m.id}
                className="p-3 rounded-lg bg-[var(--color-bg-card)] text-sm flex items-start justify-between gap-4 min-w-0"
              >
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="text-[10px] text-[var(--color-accent)]/60">{formatDateTime(m.created_at)}</div>
                  <div className="text-[var(--color-text-bright)] font-medium break-words [overflow-wrap:anywhere]">
                    Среща: {formatDateTime(m.scheduled_at)}
                  </div>
                  {(m.meeting_address || m.contact_person || m.phone) && (
                    <div className="mt-2 space-y-1 text-sm text-[var(--color-text)]">
                      {m.meeting_address && (
                        <p className="break-words [overflow-wrap:anywhere] break-all">
                          <span className="text-[var(--color-accent)]">Адрес: </span>
                          {m.meeting_address}
                        </p>
                      )}
                      {m.contact_person && (
                        <p className="break-words [overflow-wrap:anywhere] break-all">
                          <span className="text-[var(--color-accent)]">Контакт: </span>
                          {m.contact_person}
                        </p>
                      )}
                      {m.phone && (
                        <p className="break-words [overflow-wrap:anywhere] break-all">
                          <span className="text-[var(--color-accent)]">Тел.: </span>
                          {m.phone}
                        </p>
                      )}
                    </div>
                  )}
                  {m.outcome_notes ? (
                    <p className="mt-2 text-[var(--color-text)] whitespace-pre-wrap break-words [overflow-wrap:anywhere] break-all">
                      {m.outcome_notes}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-[var(--color-accent)]/70">Няма бележки след срещата.</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleEditMeeting(m)}
                    className="px-2 py-1 rounded text-[var(--color-accent)] hover:bg-[var(--color-bg-secondary)] text-xs"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (confirm("Изтриване на срещата?")) {
                        await deleteClientMeeting(m.id);
                        loadData();
                      }
                    }}
                    className="px-2 py-1 rounded text-red-400/80 hover:bg-red-500/20 text-xs"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "orders" && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap items-end">
            <select
              value={orderStatus}
              onChange={(e) => setOrderStatus(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
            >
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Amount (EUR)"
              value={orderAmount}
              onChange={(e) => setOrderAmount(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm w-24"
            />
            <input
              type="date"
              placeholder="Payment date"
              value={orderPaymentDate}
              onChange={(e) => setOrderPaymentDate(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
            />
            <input
              type="text"
              placeholder="Description"
              value={orderDesc}
              onChange={(e) => setOrderDesc(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm flex-1 min-w-[150px]"
            />
            {editingOrder ? (
              <>
                <button onClick={handleUpdateOrder} className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm font-medium">Update</button>
                <button onClick={() => { setEditingOrder(null); setOrderAmount(""); setOrderPaymentDate(""); setOrderDesc(""); }} className="px-4 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm">Cancel</button>
              </>
            ) : (
              <button onClick={handleAddOrder} className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm font-medium">Add Order</button>
            )}
          </div>
          <div className="space-y-2">
            {orders.map((o) => (
              <div
                key={o.id}
                className="p-3 rounded-lg bg-[var(--color-bg-card)] flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-[var(--color-accent)]/60">{formatDateTime(o.updated_at || o.created_at)}</div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-[var(--color-text-bright)] font-medium">
                      {o.amount != null ? `${o.amount} €` : "—"}
                    </span>
                    <span className="text-[var(--color-accent)]">•</span>
                    <span className="text-sm text-[var(--color-text)]">
                      {o.payment_date || "—"}
                    </span>
                    {o.description && (
                      <span className="text-sm text-[var(--color-accent)] truncate">{o.description}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <select
                    value={o.status}
                    onChange={(e) => handleUpdateOrderStatus(o.id, e.target.value as "pending" | "confirmed" | "shipped" | "delivered")}
                    className="px-2 py-1 rounded bg-[var(--color-bg-secondary)] text-[var(--color-text)] text-sm"
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <button onClick={() => handleEditOrder(o)} className="px-2 py-1 rounded text-[var(--color-accent)] hover:bg-[var(--color-bg-secondary)] text-xs">Edit</button>
                  <button onClick={async () => { if (confirm("Delete?")) { await deleteClientOrder(o.id); loadData(); } }} className="px-2 py-1 rounded text-red-400/80 hover:bg-red-500/20 text-xs">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "products" && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap items-end">
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
            />
            <input
              type="text"
              placeholder="Brand"
              value={purchaseBrand}
              onChange={(e) => setPurchaseBrand(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm w-32"
            />
            <input
              type="text"
              placeholder="Model"
              value={purchaseModel}
              onChange={(e) => setPurchaseModel(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm w-32"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Value"
              value={purchaseValue}
              onChange={(e) => setPurchaseValue(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm w-24"
            />
            <input
              type="text"
              placeholder="Note"
              value={purchaseNote}
              onChange={(e) => setPurchaseNote(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm flex-1 min-w-[150px]"
            />
            {editingPurchase ? (
              <>
                <button onClick={handleUpdatePurchase} className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm font-medium">Update</button>
                <button onClick={() => { setEditingPurchase(null); setPurchaseDate(new Date().toISOString().slice(0, 10)); setPurchaseBrand(""); setPurchaseModel(""); setPurchaseValue(""); setPurchaseNote(""); }} className="px-4 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm">Cancel</button>
              </>
            ) : (
              <button onClick={handleAddPurchase} className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm font-medium">Add</button>
            )}
          </div>
          <div className="space-y-2">
            {purchases.map((p) => (
              <div key={p.id} className="p-3 rounded-lg bg-[var(--color-bg-card)] flex items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] text-[var(--color-accent)]/60">{formatDateTime(p.created_at)}</div>
                  <div className="flex flex-wrap gap-2 items-center text-sm">
                    <span className="text-[var(--color-accent)]">{p.purchase_date}</span>
                    <span className="text-[var(--color-text-bright)]">{p.brand || "—"}</span>
                    <span className="text-[var(--color-text)]">{p.model || "—"}</span>
                    {p.value != null && <span className="font-medium">{p.value}</span>}
                    {p.note && <span className="text-[var(--color-accent)]/80">{p.note}</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => handleEditPurchase(p)} className="px-2 py-1 rounded text-[var(--color-accent)] hover:bg-[var(--color-bg-secondary)] text-xs">Edit</button>
                  <button onClick={async () => { if (confirm("Delete?")) { await deleteClientPurchase(p.id); loadData(); } }} className="px-2 py-1 rounded text-red-400/80 hover:bg-red-500/20 text-xs">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "custom" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Field name"
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
              readOnly={!!editingCustomField}
              className={`px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm ${editingCustomField ? "opacity-60" : ""}`}
            />
            <input
              type="text"
              placeholder="Value"
              value={newFieldValue}
              onChange={(e) => setNewFieldValue(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm flex-1"
            />
            {editingCustomField ? (
              <>
                <button onClick={handleUpdateCustomField} className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm font-medium">Update</button>
                <button onClick={() => { setEditingCustomField(null); setNewFieldName(""); setNewFieldValue(""); }} className="px-4 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm">Cancel</button>
              </>
            ) : (
              <button onClick={handleAddCustomField} className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm font-medium">Add</button>
            )}
          </div>
          <div className="space-y-2">
            {customFields.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-bg-card)]"
              >
                <div>
                  <div className="text-[10px] text-[var(--color-accent)]/60">{formatDateTime(f.created_at)}</div>
                  <span className="text-[var(--color-accent)]">{f.field_name}:</span>{" "}
                  <span className="text-[var(--color-text)]">{f.field_value || "—"}</span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => handleEditCustomField(f)} className="px-2 py-1 rounded text-[var(--color-accent)] hover:bg-[var(--color-bg-secondary)] text-xs">Edit</button>
                  <button
                    onClick={async () => {
                      if (confirm("Delete?")) {
                        await deleteClientCustomField(f.id);
                        loadData();
                      }
                    }}
                    className="px-2 py-1 rounded text-red-400/80 hover:bg-red-500/20 text-xs"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {reminderFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => {
            if (!reminderSaving) setReminderFor(null);
          }}
        >
          <div
            className="rounded-xl border border-[var(--color-bg-card)] bg-[var(--color-bg-secondary)] p-4 max-w-md w-full shadow-xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium text-[var(--color-text-bright)]">Напомняне за разговора</h3>
            <p className="text-xs text-[var(--color-accent)]">
              Избери ден и час (стъпка 30 мин). Ще се вижда в меню <strong className="text-[var(--color-text)]">REMINDERS</strong> и в брояча за днес, докато не е DONE.
            </p>
            <label className="block text-xs text-[var(--color-accent)]">Дата и час</label>
            <input
              type="datetime-local"
              step={1800}
              value={reminderAtLocal}
              onChange={(e) => setReminderAtLocal(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={reminderSaving}
                onClick={() => setReminderFor(null)}
                className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-sm text-[var(--color-text)]"
              >
                Отказ
              </button>
              <button
                type="button"
                disabled={reminderSaving}
                onClick={() => void handleSaveReminder()}
                className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm font-medium"
              >
                {reminderSaving ? "Запис…" : "Запази"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
