"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/Input";

interface PasswordChangeFormProps {
  oldPwd: string;
  setOldPwd: (v: string) => void;
  newPwd: string;
  setNewPwd: (v: string) => void;
  pwdMsg: string;
  onSubmit: (e: React.FormEvent) => void;
}

export function PasswordChangeForm({
  oldPwd,
  setOldPwd,
  newPwd,
  setNewPwd,
  pwdMsg,
  onSubmit,
}: PasswordChangeFormProps) {
  return (
    <Card>
      <h2 className="mb-4 text-section-title text-slate-700">Mi contraseña</h2>
      <form
        onSubmit={onSubmit}
        className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      >
        <Input
          label="Actual"
          type="password"
          value={oldPwd}
          onChange={(e) => setOldPwd(e.target.value)}
          required
        />
        <Input
          label="Nueva"
          type="password"
          value={newPwd}
          onChange={(e) => setNewPwd(e.target.value)}
          required
        />
        <Button type="submit" className="w-full sm:w-auto">
          Cambiar
        </Button>
      </form>
      {pwdMsg && <p className="mt-2 text-sm text-slate-500">{pwdMsg}</p>}
    </Card>
  );
}
