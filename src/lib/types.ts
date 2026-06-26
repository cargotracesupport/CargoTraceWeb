// Canonical app types — mirror of the DB schema (supabase/migrations/0001_init.sql).

export type Role = "admin" | "driver" | "agent";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  driver: "Driver",
  agent: "Agent",
};

export type DeliveryStatus =
  | "awaiting_dropoff"
  | "pending"
  | "assigned"
  | "en_route"
  | "delivered"
  | "cancelled";

export interface Organization {
  id: string;
  name: string;
  created_at: string;
}

export interface Profile {
  id: string;
  org_id: string;
  role: Role;
  full_name: string | null;
  phone: string | null;
  vehicle_id: string | null;
  agent_id: string | null;
  created_at: string;
}

export interface Vehicle {
  id: string;
  org_id: string;
  name: string;
  plate: string | null;
  created_at: string;
}

export interface Device {
  id: string;
  org_id: string;
  hardware_id: string;
  label: string | null;
  vehicle_id: string | null;
  created_at: string;
}

export interface Delivery {
  id: string;
  org_id: string;
  reference: string | null;
  goods: string | null;
  status: DeliveryStatus;
  driver_id: string | null;
  vehicle_id: string | null;
  device_id: string | null;
  agent_id: string | null;
  origin_label: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  dest_label: string | null;
  dest_lat: number | null;
  dest_lng: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  tracking_token: string;
  last_lat: number | null;
  last_lng: number | null;
  last_speed: number | null;
  last_position_at: string | null;
  created_at: string;
  assigned_at: string | null;
  started_at: string | null;
  delivered_at: string | null;
}

export interface Position {
  id: number;
  org_id: string;
  delivery_id: string | null;
  device_id: string | null;
  driver_id: string | null;
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  recorded_at: string;
  created_at: string;
}

export const STATUS_LABEL: Record<DeliveryStatus, string> = {
  awaiting_dropoff: "Awaiting drop-off",
  pending: "Pending",
  assigned: "Assigned",
  en_route: "En route",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
