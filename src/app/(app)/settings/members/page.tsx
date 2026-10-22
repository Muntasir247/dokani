"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useTenant } from "@/context/tenant-context";
import { UserRole } from "@/types/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { UserPlus, Trash2, Mail, Shield, Check, Copy } from "lucide-react";

interface MemberItem {
  id: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  user: {
    id: string;
    email: string;
    full_name: string;
  };
}

interface InvitationItem {
  id: string;
  email: string;
  role: UserRole;
  token: string;
  expires_at: string;
  created_at: string;
}

export default function MembersSettingsPage() {
  const { activeTenant, currentRole } = useTenant();
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"manager" | "cashier">("cashier");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const supabase = createClient();

  const loadData = React.useCallback(async () => {
    if (!activeTenant) return;

    // Load active members under RLS
    const { data: memberRows, error: memberError } = (await supabase
      .from("tenant_members")
      .select(`
        id,
        role,
        is_active,
        created_at,
        profiles (
          id,
          email,
          full_name
        )
      `)
      .eq("tenant_id", activeTenant.id)
      .is("deleted_at", null)) as {
      data: Array<{
        id: string;
        role: UserRole;
        is_active: boolean;
        created_at: string;
        profiles: { id: string; email: string; full_name: string };
      }> | null;
      error: { message: string } | null;
    };

    if (!memberError && memberRows) {
      setMembers(
        memberRows.map((m) => ({
          id: m.id,
          role: m.role,
          is_active: m.is_active,
          created_at: m.created_at,
          user: m.profiles as unknown as MemberItem["user"],
        }))
      );
    }

    // Load pending invitations
    const { data: inviteRows, error: inviteError } = await supabase
      .from("tenant_invitations")
      .select("id, email, role, token, expires_at, created_at")
      .eq("tenant_id", activeTenant.id)
      .is("accepted_at", null)
      .is("deleted_at", null);

    if (!inviteError && inviteRows) {
      setInvitations(inviteRows as InvitationItem[]);
    }
  }, [activeTenant, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTenant) return;
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/members/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: activeTenant.id,
          email: inviteEmail,
          role: inviteRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: "error", message: data.error || "Failed to send invitation" });
        return;
      }

      setFeedback({ type: "success", message: `Invitation created for ${inviteEmail}` });
      setInviteEmail("");
      loadData();
    } catch (err: unknown) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Network error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: UserRole) => {
    if (!activeTenant) return;
    setFeedback(null);

    try {
      const res = await fetch("/api/members/roles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: activeTenant.id,
          memberId,
          newRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: "error", message: data.error || "Failed to update role" });
        return;
      }

      setFeedback({ type: "success", message: "Staff role updated successfully" });
      loadData();
    } catch (err: unknown) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Network error" });
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    try {
      const res = await fetch("/api/members/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId }),
      });

      if (res.ok) {
        setFeedback({ type: "success", message: "Invitation revoked" });
        loadData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/signup?invite=${token}`;
    navigator.clipboard.writeText(link);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  const isOwner = currentRole === "owner";

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Staff & Permissions</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage who can access {activeTenant?.name} and assign role permissions.
        </p>

        {/* Subnav Tabs */}
        <div className="flex items-center gap-2 mt-4">
          <Link
            href="/settings"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
          >
            Store & Invoices
          </Link>
          <Link
            href="/settings/members"
            className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"
          >
            Staff & Roles
          </Link>
          <Link
            href="/settings/billing"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
          >
            Plan & Billing
          </Link>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-lg p-3 text-xs border ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-rose-50 text-rose-800 border-rose-200"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Invite Staff Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-emerald-600" />
            <span>Invite Team Member</span>
          </CardTitle>
          <CardDescription>
            Send an invitation to a cashier or manager. Cashiers have POS checkout access without seeing cost prices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 w-full">
              <Input
                label="Staff Email"
                type="email"
                placeholder="staff@gmail.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </div>

            <div className="w-full sm:w-44">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Role
              </label>
              <select
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "manager" | "cashier")}
              >
                <option value="cashier">Cashier</option>
                {isOwner && <option value="manager">Manager</option>}
              </select>
            </div>

            <Button type="submit" isLoading={isSubmitting} className="w-full sm:w-auto">
              Send Invite
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Active Members Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-slate-700" />
            <span>Active Team Members ({members.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between p-4 hover:bg-slate-50 transition">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-slate-700 font-semibold text-xs uppercase">
                    {member.user?.full_name?.slice(0, 2) || "ST"}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{member.user?.full_name || "Staff Member"}</p>
                    <p className="text-xs text-slate-500 font-mono">{member.user?.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {isOwner && member.role !== "owner" ? (
                    <select
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.id, e.target.value as UserRole)}
                    >
                      <option value="cashier">Cashier</option>
                      <option value="manager">Manager</option>
                      <option value="owner">Owner</option>
                    </select>
                  ) : (
                    <Badge variant={member.role === "owner" ? "success" : member.role === "manager" ? "info" : "default"}>
                      {member.role}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-amber-600" />
              <span>Pending Invitations ({invitations.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {invitations.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-900">{inv.email}</p>
                      <Badge variant="warning">{inv.role}</Badge>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Expires: {new Date(inv.expires_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => copyInviteLink(inv.token)}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                      title="Copy invitation link"
                    >
                      {copiedToken === inv.token ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy Link</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleRevokeInvitation(inv.id)}
                      className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                      title="Revoke invitation"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
