"use client";

import React from "react";
import { formatBDT } from "@/lib/money";
import { Truck } from "lucide-react";

export interface ShipmentTimelineEvent {
  status: string;
  timestamp: string;
  note: string;
}

export interface ShipmentDetails {
  id: string;
  courier_provider: string;
  consignment_id: string;
  tracking_code: string;
  status: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  cod_amount_poisha: number;
  delivery_fee_poisha: number;
  timeline: ShipmentTimelineEvent[];
  created_at: string;
  updated_at: string;
}

interface TrackingTimelineProps {
  shipment: ShipmentDetails | null;
  onDispatchClick?: () => void;
}

export function TrackingTimeline({ shipment, onDispatchClick }: TrackingTimelineProps) {
  if (!shipment) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 mb-2">
          <Truck className="h-5 w-5" />
        </div>
        <h4 className="text-sm font-bold text-slate-800">No Courier Parcel Booked</h4>
        <p className="mt-1 text-xs text-slate-500 max-w-xs mx-auto">
          This order has not been dispatched to Steadfast or Pathao Courier yet.
        </p>
        {onDispatchClick && (
          <button
            onClick={onDispatchClick}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition"
          >
            <Truck className="h-4 w-4" />
            <span>Dispatch to Courier</span>
          </button>
        )}
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "delivered":
        return <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">Delivered</span>;
      case "in_transit":
      case "picked":
        return <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">In Transit</span>;
      case "cancelled":
      case "return":
        return <span className="rounded-md bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800 uppercase">{status}</span>;
      case "hold":
        return <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">On Hold</span>;
      default:
        return <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700 uppercase">{status}</span>;
    }
  };

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm"
      role="region"
      aria-label="Courier Shipment Tracking"
    >
      {/* Header Info */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600" aria-hidden="true">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold uppercase text-slate-900">
                {shipment.courier_provider}
              </span>
              {getStatusBadge(shipment.status)}
            </div>
            <p className="text-xs text-slate-500 font-mono">
              Tracking: <strong className="text-slate-800">{shipment.tracking_code}</strong> • CID: {shipment.consignment_id}
            </p>
          </div>
        </div>

        <div className="text-right text-xs">
          <span className="text-slate-400">COD Collection:</span>
          <div className="font-bold text-slate-900 text-sm font-mono">
            {formatBDT(shipment.cod_amount_poisha)}
          </div>
        </div>
      </div>

      {/* Recipient Details */}
      <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
        <div><strong>Recipient:</strong> {shipment.recipient_name} ({shipment.recipient_phone})</div>
        <div><strong>Address:</strong> {shipment.recipient_address}</div>
      </div>

      {/* Chronological Timeline */}
      <div className="space-y-3 pt-1">
        <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Delivery Timeline
        </h5>
        <div
          role="list"
          aria-label="Shipment status updates"
          className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200"
        >
          {(shipment.timeline || []).map((event, idx) => {
            const isDelivered = event.status === "delivered";
            const isLatest = idx === (shipment.timeline || []).length - 1;
            return (
              <div key={idx} role="listitem" className="relative group">
                <div
                  className={`absolute -left-6 top-1 h-2.5 w-2.5 rounded-full border-2 border-white shadow-xs ${
                    isDelivered
                      ? "bg-emerald-500"
                      : isLatest
                      ? "bg-blue-600 ring-2 ring-blue-100"
                      : "bg-slate-400"
                  }`}
                />
                <div className="text-xs">
                  <div className="flex items-baseline justify-between">
                    <span className="font-bold text-slate-900 capitalize">
                      {event.status.replace("_", " ")}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(event.timestamp).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="mt-0.5 text-slate-600 text-[11px] leading-relaxed">
                    {event.note}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
