"use client";

import { useState, useTransition } from "react";
import { assignMention } from "@/app/actions";
import { toast } from "@/components/feedback";
import { fill, useClientDict } from "@/components/client-dict";

export function AssignSelect({ mentionId, value, members }: { mentionId: string; value: string; members: { id: string; name: string }[] }) {
  const [v, setV] = useState(value);
  const [pending, start] = useTransition();
  const { toasts, common } = useClientDict();
  return (
    <select
      className="input h-8 w-auto py-0 text-[13px]"
      value={v}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        setV(next);
        start(async () => {
          const res = await assignMention(mentionId, next || null);
          if (!res.ok) return toast(common.failed, "error");
          toast(res.name ? fill(toasts.assigned, { name: res.name }) : toasts.unassigned);
        });
      }}
    >
      <option value="">{common.unassigned}</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>{m.name}</option>
      ))}
    </select>
  );
}
