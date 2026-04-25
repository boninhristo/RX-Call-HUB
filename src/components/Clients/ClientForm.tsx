import { useState } from "react";
import type { Client } from "../../lib/db";

interface ClientFormProps {
  client?: Client | null;
  onSubmit: (data: Omit<Client, "id" | "created_at" | "updated_at">) => void;
  onCancel: () => void;
}

export function ClientForm({ client, onSubmit, onCancel }: ClientFormProps) {
  const [data, setData] = useState({
    name: client?.name ?? "",
    company: client?.company ?? "",
    turnover: client?.turnover ?? "",
    phone: client?.phone ?? "",
    email: client?.email ?? "",
    address: client?.address ?? "",
    eik: client?.eik ?? "",
    vat_number: client?.vat_number ?? "",
    contact_person: client?.contact_person ?? "",
    bank_account: client?.bank_account ?? "",
    notes: client?.notes ?? "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(data as Omit<Client, "id" | "created_at" | "updated_at">);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-[var(--color-accent)] mb-1">Name *</label>
          <input
            type="text"
            value={data.name}
            onChange={(e) => setData({ ...data, name: e.target.value })}
            required
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-[var(--color-text)] placeholder:text-[var(--color-accent)]/60 focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-accent)] mb-1">Company</label>
          <input
            type="text"
            value={data.company}
            onChange={(e) => setData({ ...data, company: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-[var(--color-text)] placeholder:text-[var(--color-accent)]/60 focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-[var(--color-accent)] mb-1">Turnover</label>
        <input
          type="text"
          value={data.turnover}
          onChange={(e) => setData({ ...data, turnover: e.target.value })}
          className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-[var(--color-text)] placeholder:text-[var(--color-accent)]/60 focus:outline-none focus:border-[var(--color-accent)]"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-[var(--color-accent)] mb-1">Phone</label>
          <input
            type="text"
            value={data.phone}
            onChange={(e) => setData({ ...data, phone: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-[var(--color-text)] placeholder:text-[var(--color-accent)]/60 focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-accent)] mb-1">Email</label>
          <input
            type="email"
            value={data.email}
            onChange={(e) => setData({ ...data, email: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-[var(--color-text)] placeholder:text-[var(--color-accent)]/60 focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-[var(--color-accent)] mb-1">Address</label>
        <input
          type="text"
          value={data.address}
          onChange={(e) => setData({ ...data, address: e.target.value })}
          className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-[var(--color-text)] placeholder:text-[var(--color-accent)]/60 focus:outline-none focus:border-[var(--color-accent)]"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-[var(--color-accent)] mb-1">EIK</label>
          <input
            type="text"
            value={data.eik}
            onChange={(e) => setData({ ...data, eik: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-[var(--color-text)] placeholder:text-[var(--color-accent)]/60 focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-accent)] mb-1">VAT Number</label>
          <input
            type="text"
            value={data.vat_number}
            onChange={(e) => setData({ ...data, vat_number: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-[var(--color-text)] placeholder:text-[var(--color-accent)]/60 focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-[var(--color-accent)] mb-1">Contact Person</label>
          <input
            type="text"
            value={data.contact_person}
            onChange={(e) => setData({ ...data, contact_person: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-[var(--color-text)] placeholder:text-[var(--color-accent)]/60 focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-accent)] mb-1">Bank Account</label>
          <input
            type="text"
            value={data.bank_account}
            onChange={(e) => setData({ ...data, bank_account: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-[var(--color-text)] placeholder:text-[var(--color-accent)]/60 focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-[var(--color-accent)] mb-1">Notes</label>
        <textarea
          value={data.notes}
          onChange={(e) => setData({ ...data, notes: e.target.value })}
          rows={3}
          className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-[var(--color-text)] placeholder:text-[var(--color-accent)]/60 focus:outline-none focus:border-[var(--color-accent)] resize-none"
        />
      </div>
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm font-medium hover:bg-[var(--color-accent-light)] transition-colors"
        >
          {client ? "Update" : "Add"} Client
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm hover:bg-[var(--color-bg-card)]/80 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
